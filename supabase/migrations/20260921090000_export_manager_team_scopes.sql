-- Explicit manager scopes for governed exports only. No customer RLS changes.
begin;
create table private.crm_export_manager_teams (
 manager_id uuid not null references public.profiles(id),
 team text not null check (team=btrim(team) and team<>''),
 active boolean not null default true,
 reason text not null check (char_length(btrim(reason)) between 8 and 1000),
 approval_reference text not null check (char_length(btrim(approval_reference)) between 8 and 1000),
 primary key(manager_id,team)
);
create table private.crm_export_manager_team_events (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default clock_timestamp(),
 executor text not null,
 before_data jsonb, after_data jsonb not null
);
alter table private.crm_export_manager_teams enable row level security;
alter table private.crm_export_manager_team_events enable row level security;
revoke all on private.crm_export_manager_teams,private.crm_export_manager_team_events from public,anon,authenticated,service_role;
create trigger crm_export_manager_team_events_immutable before update or delete on private.crm_export_manager_team_events
for each row execute function private.reject_risk_event_mutation();
create trigger crm_export_manager_teams_no_delete before delete on private.crm_export_manager_teams
for each row execute function private.reject_risk_event_mutation();
create function private.audit_crm_export_manager_team() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.manager_id,new.team) is distinct from (old.manager_id,old.team) then
  raise exception '授权对象不可改绑，请停用旧授权后新建';
 end if;
 insert into private.crm_export_manager_team_events(executor,before_data,after_data)
 values(session_user,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function private.audit_crm_export_manager_team() from public,anon,authenticated,service_role;
create trigger crm_export_manager_teams_audit after insert or update on private.crm_export_manager_teams
for each row execute function private.audit_crm_export_manager_team();
create function private.crm_export_manager_covers(manager uuid,target_team text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=manager and p.active=true and p.role='sales_manager'
 and nullif(btrim(target_team),'') is not null
 and case when exists(select 1 from private.crm_export_manager_teams t where t.manager_id=p.id)
 then exists(select 1 from private.crm_export_manager_teams t where t.manager_id=p.id and t.team=target_team and t.active)
 else p.team=target_team end);
$$;
revoke all on function private.crm_export_manager_covers(uuid,text) from public,anon,authenticated,service_role;

create or replace function private.assert_crm_export_scope(r public.crm_export_requests) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=r.requester_id and active=true;
 if p.id is null or p.role is distinct from r.requester_role or p.team is distinct from r.requester_team then
  raise exception '申请人身份已变化，请重新申请';
 end if;
 if exists(select 1 from public.risk_user_controls where user_id=p.id and
   (export_suspended or download_suspended or sensitive_reveal_suspended)) then
  raise exception '风险控制暂停导出，请先完成风险复验';
 end if;
 if exists(
  select 1 from jsonb_array_elements(r.snapshot) s
  left join public.inquiries i on i.id=(s->>'id')::uuid
  left join public.profiles holder on holder.id=i.owner_id
  where i.id is null or i.excluded_from_dashboard is true
   or i.owner_id is distinct from (s->>'owner_id')::uuid
   or holder.team is distinct from r.scope_team
   or not (p.role='owner' or (p.role='sales_manager' and private.crm_export_manager_covers(p.id,r.scope_team)) or (p.role='sales' and i.owner_id=p.id))
 ) then raise exception '客户归属或可见范围已变化，请重新申请'; end if;
end $$;

create or replace function public.request_crm_export(inquiry_ids uuid[],export_purpose text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.profiles; n integer; team_count integer; selected_team text; payload jsonb; r public.crm_export_requests;
begin
 p:=private.crm_export_actor();
 if inquiry_ids is null or cardinality(inquiry_ids) not between 1 and 200 then raise exception '每次请选择 1–200 条询盘'; end if;
 if char_length(btrim(coalesce(export_purpose,''))) not between 8 and 1000 then raise exception '请填写 8–1000 字导出用途'; end if;
 if array_position(inquiry_ids,null) is not null or (select count(distinct x) from unnest(inquiry_ids) x)<>cardinality(inquiry_ids) then raise exception '询盘编号不能重复或为空'; end if;
 -- Bound pending requests; serialize per requester to avoid concurrent quota bypass.
 perform pg_advisory_xact_lock(hashtextextended('export-request:'||p.id::text,0));
 if (select count(*) from public.crm_export_requests where requester_id=p.id and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception '导出申请过于频繁，请稍后再试'; end if;
 if (select count(*) from public.crm_export_requests where requester_id=p.id and status in ('pending','approved') and expires_at>clock_timestamp())>=10 then raise exception '未完成导出申请过多，请先处理或撤回'; end if;
 select count(*),count(distinct holder.team),min(holder.team),
  jsonb_agg(jsonb_build_object('id',i.id,'owner_id',i.owner_id,'inquiry_no',i.inquiry_no,
   'status',i.status,'created_at',i.created_at,'target_country',i.target_country,'product_category',i.product_category) order by i.id)
 into n,team_count,selected_team,payload
 from public.inquiries i join public.profiles holder on holder.id=i.owner_id
 where i.id=any(inquiry_ids) and not coalesce(i.excluded_from_dashboard,false)
   and nullif(btrim(holder.team),'') is not null
   and (p.role='owner' or (p.role='sales_manager' and private.crm_export_manager_covers(p.id,holder.team)) or (p.role='sales' and i.owner_id=p.id));
 if n<>cardinality(inquiry_ids) or team_count<>1 then raise exception '仅支持当前权限内、已分配且同一团队的询盘；不可混入其他团队或未分配记录'; end if;
 r.requester_id:=p.id;r.requester_role:=p.role;r.requester_team:=p.team;r.scope_team:=selected_team;r.snapshot:=payload;
 perform private.assert_crm_export_scope(r);
 insert into public.crm_export_requests(requester_id,requester_role,requester_team,scope_team,purpose,snapshot,snapshot_hash)
 values(p.id,p.role,p.team,selected_team,btrim(export_purpose),payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex')) returning * into r;
 insert into public.crm_export_events(request_id,actor_id,event_type,reason,metadata)
 values(r.id,p.id,'requested',r.purpose,jsonb_build_object('row_count',n,'snapshot_hash',r.snapshot_hash,'data_level','L3','before_status',null,'after_status','pending'));
 return r.id;
end $$;

create or replace function public.list_crm_exports() returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=private.crm_export_actor();
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into result from (
  select r.id,r.requester_id,r.scope_team,r.purpose,r.status,r.created_at,r.expires_at,r.download_expires_at,r.consumed_at,
   jsonb_array_length(r.snapshot) as row_count,r.data_level,r.snapshot_hash,
   coalesce((select jsonb_agg(jsonb_build_object('stage',a.stage,'reviewer_id',a.reviewer_id,'approved',a.approved,'reason',a.reason)) from public.crm_export_approvals a where a.request_id=r.id),'[]'::jsonb) as approvals
  from public.crm_export_requests r where r.requester_id=p.id or p.role='owner'
   or (p.role='sales_manager' and private.crm_export_manager_covers(p.id,r.scope_team))
  order by r.created_at desc limit 100
 ) x;
 return result;
end $$;

create or replace function public.preview_crm_export(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.crm_export_requests;
begin
 p:=private.crm_export_actor();select * into r from public.crm_export_requests where id=request_id;
 if r.id is null or not (r.requester_id=p.id or p.role='owner' or (p.role='sales_manager' and private.crm_export_manager_covers(p.id,r.scope_team))) then raise exception '无权查看该导出申请'; end if;
 perform private.assert_crm_export_scope(r);
 if exists(select 1 from public.risk_user_controls where user_id=p.id and sensitive_reveal_suspended) then raise exception '当前账号暂停敏感查看'; end if;
 insert into public.crm_export_events(request_id,actor_id,event_type,reason) values(r.id,p.id,'previewed','查看待审批固定字段快照');
 return jsonb_build_object('id',r.id,'snapshot_hash',r.snapshot_hash,'rows',r.snapshot);
end $$;

create or replace function public.review_crm_export(request_id uuid,approve boolean,review_reason text,reviewed_hash text) returns text
language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.crm_export_requests; review_stage text; next_status text;
begin
 p:=private.crm_export_actor();select * into r from public.crm_export_requests where id=request_id for update;
 if r.id is null or r.requester_id=p.id then raise exception '不能审批本人申请或不存在的申请'; end if;
 review_stage:=case when p.role='owner' then 'owner' when p.role='sales_manager' and private.crm_export_manager_covers(p.id,r.scope_team) then 'manager' else null end;
 if review_stage is null then raise exception '无权审批该团队导出'; end if;
 if r.status<>'pending' or r.expires_at<=clock_timestamp() then raise exception '申请已处理或过期'; end if;
 if approve is null or reviewed_hash is distinct from r.snapshot_hash or char_length(btrim(coalesce(review_reason,''))) not between 8 and 1000 then raise exception '请核对快照并填写 8–1000 字审批依据'; end if;
 perform private.assert_crm_export_scope(r);
 if exists(select 1 from public.risk_user_controls where user_id=p.id and (export_suspended or sensitive_reveal_suspended)) then raise exception '当前审核人受风险限制'; end if;
 insert into public.crm_export_approvals(request_id,stage,reviewer_id,approved,reason) values(r.id,review_stage,p.id,approve,btrim(review_reason));
 next_status:=case when not approve then 'rejected' when (select count(*) from public.crm_export_approvals where crm_export_approvals.request_id=r.id and approved)=2 then 'approved' else 'pending' end;
 update public.crm_export_requests set status=next_status,download_expires_at=case when next_status='approved' then least(expires_at,clock_timestamp()+interval '10 minutes') else null end where id=r.id;
 insert into public.crm_export_events(request_id,actor_id,event_type,reason,metadata) values(r.id,p.id,case when approve then 'approved_'||review_stage else 'rejected' end,btrim(review_reason),jsonb_build_object('snapshot_hash',r.snapshot_hash,'before_status',r.status,'after_status',next_status));
 return next_status;
end $$;

create or replace function public.revoke_crm_export(request_id uuid,revoke_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.crm_export_requests;
begin
 p:=private.crm_export_actor();select * into r from public.crm_export_requests where id=request_id for update;
 if r.id is null or not (r.requester_id=p.id or p.role='owner' or (p.role='sales_manager' and private.crm_export_manager_covers(p.id,r.scope_team))) then raise exception '无权撤回该申请'; end if;
 if r.status not in ('pending','approved') then raise exception '申请已结束，已下载文件无法收回'; end if;
 if char_length(btrim(coalesce(revoke_reason,''))) not between 8 and 1000 then raise exception '请填写撤回原因'; end if;
 update public.crm_export_requests set status='revoked' where id=r.id;
 insert into public.crm_export_events(request_id,actor_id,event_type,reason,metadata) values(r.id,p.id,'revoked',btrim(revoke_reason),jsonb_build_object('before_status',r.status,'after_status','revoked'));
end $$;

create or replace function public.consume_crm_export(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.crm_export_requests; csv text; stamp text;
begin
 p:=private.crm_export_actor();select * into r from public.crm_export_requests where id=request_id for update;
 if r.id is null or r.requester_id<>p.id then raise exception '只能下载本人申请'; end if;
 if r.status<>'approved' or r.download_expires_at is null or r.download_expires_at<=clock_timestamp() then raise exception '申请未获双审批、已过期或已使用'; end if;
 perform pg_advisory_xact_lock(hashtextextended('risk-control:'||p.id::text,0));
 perform private.assert_crm_export_scope(r);
 if (select count(*) from public.crm_export_approvals a join public.profiles reviewer on reviewer.id=a.reviewer_id
  where a.request_id=r.id and a.approved and reviewer.active=true and reviewer.id<>p.id
   and not exists(select 1 from public.risk_user_controls controls where controls.user_id=reviewer.id and (controls.export_suspended or controls.sensitive_reveal_suspended))
   and ((a.stage='owner' and reviewer.role='owner') or (a.stage='manager' and reviewer.role='sales_manager' and private.crm_export_manager_covers(reviewer.id,r.scope_team))))<>2 then
  raise exception '审核人权限已变化，请重新申请';
 end if;
 stamp:=clock_timestamp()::text;
 select '审批号,申请人,生成时间,快照哈希,询盘编号,状态,创建时间,国家,产品类别'||E'\r\n'||
 string_agg(private.crm_export_csv_cell(r.id::text)||','||private.crm_export_csv_cell(p.id::text)||','||private.crm_export_csv_cell(stamp)||','||private.crm_export_csv_cell(r.snapshot_hash)||','||
 private.crm_export_csv_cell(s->>'inquiry_no')||','||private.crm_export_csv_cell(s->>'status')||','||private.crm_export_csv_cell(s->>'created_at')||','||
 private.crm_export_csv_cell(s->>'target_country')||','||private.crm_export_csv_cell(s->>'product_category'),E'\r\n' order by s->>'id')
 into csv from jsonb_array_elements(r.snapshot) s;
 update public.crm_export_requests set status='consumed',consumed_at=clock_timestamp() where id=r.id;
 insert into public.crm_export_events(request_id,actor_id,event_type,reason,metadata) values(r.id,p.id,'consumed','一次性授权生成 CSV',jsonb_build_object('rows',jsonb_array_length(r.snapshot),'snapshot_hash',r.snapshot_hash,'before_status',r.status,'after_status','consumed'));
 return jsonb_build_object('filename','CRM-inquiries-'||r.id::text||'.csv','content',csv,'content_type','text/csv;charset=utf-8');
end $$;

create or replace function private.notify_crm_export_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.crm_export_requests; message_title text;
begin
 select * into r from public.crm_export_requests where id=new.request_id;
 if new.event_type='requested' then
  insert into public.notifications(recipient_id,inquiry_id,type,title,body,export_request_id,export_event_id)
  select p.id,null,'crm_export_review','导出申请待独立审核',
   '有一条 L3 导出申请待审核。请进入审批中心核对范围与用途；此通知不包含客户内容。',r.id,new.id
  from public.profiles p where p.active=true and p.id<>r.requester_id
   and (p.role='owner' or (p.role='sales_manager' and private.crm_export_manager_covers(p.id,r.scope_team)))
  on conflict(export_event_id,recipient_id) where export_event_id is not null do nothing;
  -- No fallback reviewer or auto-approval when an independent stage is absent.
  if not exists(select 1 from public.profiles p where p.active=true and p.role='owner' and p.id<>r.requester_id)
   or not exists(select 1 from public.profiles p where p.active=true and p.role='sales_manager' and private.crm_export_manager_covers(p.id,r.scope_team) and p.id<>r.requester_id) then
   insert into public.notifications(recipient_id,type,title,body,export_request_id,export_event_id)
   values(r.requester_id,'crm_export_review','导出申请缺少独立审核人','申请已保存，但缺少独立主管或老板。请落实审核人；系统不会自动放行。',r.id,new.id)
   on conflict(export_event_id,recipient_id) where export_event_id is not null do nothing;
  end if;
 elsif new.event_type in ('approved_manager','approved_owner','rejected','revoked','consumed') then
  message_title:=case when new.event_type='rejected' then '导出申请已驳回'
   when new.event_type='revoked' then '导出申请已撤回'
   when new.event_type='consumed' then '导出授权已领取'
   when r.status='approved' then '导出申请已获双审批' else '导出申请仍待另一位审核' end;
  insert into public.notifications(recipient_id,type,title,body,export_request_id,export_event_id)
  select p.id,'crm_export_status',message_title,
   case when r.status='approved' then '请在批准后的 10 分钟有效期内进入审批中心领取一次。领取时仍会核对权限和风险状态。'
   else '请进入导出审批中心查看最新状态与处理记录。' end,r.id,new.id
  from public.profiles p where p.id=r.requester_id and p.active=true
  on conflict(export_event_id,recipient_id) where export_event_id is not null do nothing;
 end if;
 return new;
end $$;

commit;
