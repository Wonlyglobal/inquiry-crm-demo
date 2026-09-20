-- First governed export: fixed-field inquiry register. No arbitrary client payload,
-- attachments, financial credentials, free-form email bodies or AI answers.
begin;
create table public.crm_export_requests (
 id uuid primary key default gen_random_uuid(),
 requester_id uuid not null references public.profiles(id),
 requester_role text not null, requester_team text, scope_team text not null,
 purpose text not null check(char_length(purpose) between 8 and 1000),
 data_level text not null default 'L3' check(data_level='L3'),
 status text not null default 'pending' check(status in ('pending','approved','rejected','revoked','consumed')),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='array'),
 snapshot_hash text not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
 download_expires_at timestamptz, consumed_at timestamptz
);
create table public.crm_export_approvals (
 request_id uuid not null references public.crm_export_requests(id),
 stage text not null check(stage in ('manager','owner')),
 reviewer_id uuid not null references public.profiles(id),
 approved boolean not null, reason text not null check(char_length(reason) between 8 and 1000),
 created_at timestamptz not null default clock_timestamp(),
 primary key(request_id,stage),unique(request_id,reviewer_id)
);
create table public.crm_export_events (
 id bigint generated always as identity primary key,
 request_id uuid not null references public.crm_export_requests(id),
 actor_id uuid not null references public.profiles(id),
 event_type text not null,reason text not null,metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.crm_export_requests enable row level security;
alter table public.crm_export_approvals enable row level security;
alter table public.crm_export_events enable row level security;
revoke all on public.crm_export_requests,public.crm_export_approvals,public.crm_export_events from public,anon,authenticated;
grant all on public.crm_export_requests,public.crm_export_approvals,public.crm_export_events to service_role;
create trigger crm_export_events_immutable before update or delete on public.crm_export_events
for each row execute function private.reject_risk_event_mutation();
create trigger crm_export_approvals_immutable before update or delete on public.crm_export_approvals
for each row execute function private.reject_risk_event_mutation();

create function private.protect_crm_export_snapshot() returns trigger
language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-array['status','download_expires_at','consumed_at']) is distinct from
    (to_jsonb(old)-array['status','download_expires_at','consumed_at']) then
  raise exception '审批快照与申请范围不可修改，须重新申请';
 end if;
 return new;
end $$;
revoke all on function private.protect_crm_export_snapshot() from public,anon,authenticated;
create trigger crm_export_snapshot_immutable before update on public.crm_export_requests
for each row execute function private.protect_crm_export_snapshot();

create function private.crm_export_actor() returns public.profiles
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=auth.uid() and active=true;
 if p.id is null or p.role is null or p.role not in ('owner','sales_manager','sales') then
  raise exception '当前账号无权使用导出审批';
 end if;
 return p;
end $$;
revoke all on function private.crm_export_actor() from public,anon,authenticated;

create function private.assert_crm_export_scope(r public.crm_export_requests) returns void
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
   or not (p.role='owner' or (p.role='sales_manager' and p.team=r.scope_team) or (p.role='sales' and i.owner_id=p.id))
 ) then raise exception '客户归属或可见范围已变化，请重新申请'; end if;
end $$;
revoke all on function private.assert_crm_export_scope(public.crm_export_requests) from public,anon,authenticated;

create function public.request_crm_export(inquiry_ids uuid[],export_purpose text) returns uuid
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
   and (p.role='owner' or (p.role='sales_manager' and p.team=holder.team) or (p.role='sales' and i.owner_id=p.id));
 if n<>cardinality(inquiry_ids) or team_count<>1 then raise exception '仅支持当前权限内、已分配且同一团队的询盘；不可混入其他团队或未分配记录'; end if;
 r.requester_id:=p.id;r.requester_role:=p.role;r.requester_team:=p.team;r.scope_team:=selected_team;r.snapshot:=payload;
 perform private.assert_crm_export_scope(r);
 insert into public.crm_export_requests(requester_id,requester_role,requester_team,scope_team,purpose,snapshot,snapshot_hash)
 values(p.id,p.role,p.team,selected_team,btrim(export_purpose),payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex')) returning * into r;
 insert into public.crm_export_events(request_id,actor_id,event_type,reason,metadata)
 values(r.id,p.id,'requested',r.purpose,jsonb_build_object('row_count',n,'snapshot_hash',r.snapshot_hash,'data_level','L3','before_status',null,'after_status','pending'));
 return r.id;
end $$;
revoke all on function public.request_crm_export(uuid[],text) from public,anon;
grant execute on function public.request_crm_export(uuid[],text) to authenticated;

create function public.list_crm_exports() returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 p:=private.crm_export_actor();
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into result from (
  select r.id,r.requester_id,r.scope_team,r.purpose,r.status,r.created_at,r.expires_at,r.download_expires_at,r.consumed_at,
   jsonb_array_length(r.snapshot) as row_count,r.data_level,r.snapshot_hash,
   coalesce((select jsonb_agg(jsonb_build_object('stage',a.stage,'reviewer_id',a.reviewer_id,'approved',a.approved,'reason',a.reason)) from public.crm_export_approvals a where a.request_id=r.id),'[]'::jsonb) as approvals
  from public.crm_export_requests r where r.requester_id=p.id or p.role='owner'
   or (p.role='sales_manager' and p.team=r.scope_team)
  order by r.created_at desc limit 100
 ) x;
 return result;
end $$;
revoke all on function public.list_crm_exports() from public,anon;
grant execute on function public.list_crm_exports() to authenticated;

create function public.preview_crm_export(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.crm_export_requests;
begin
 p:=private.crm_export_actor();select * into r from public.crm_export_requests where id=request_id;
 if r.id is null or not (r.requester_id=p.id or p.role='owner' or (p.role='sales_manager' and p.team=r.scope_team)) then raise exception '无权查看该导出申请'; end if;
 perform private.assert_crm_export_scope(r);
 if exists(select 1 from public.risk_user_controls where user_id=p.id and sensitive_reveal_suspended) then raise exception '当前账号暂停敏感查看'; end if;
 insert into public.crm_export_events(request_id,actor_id,event_type,reason) values(r.id,p.id,'previewed','查看待审批固定字段快照');
 return jsonb_build_object('id',r.id,'snapshot_hash',r.snapshot_hash,'rows',r.snapshot);
end $$;
revoke all on function public.preview_crm_export(uuid) from public,anon;
grant execute on function public.preview_crm_export(uuid) to authenticated;

create function public.review_crm_export(request_id uuid,approve boolean,review_reason text,reviewed_hash text) returns text
language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.crm_export_requests; review_stage text; next_status text;
begin
 p:=private.crm_export_actor();select * into r from public.crm_export_requests where id=request_id for update;
 if r.id is null or r.requester_id=p.id then raise exception '不能审批本人申请或不存在的申请'; end if;
 review_stage:=case when p.role='owner' then 'owner' when p.role='sales_manager' and p.team=r.scope_team then 'manager' else null end;
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
revoke all on function public.review_crm_export(uuid,boolean,text,text) from public,anon;
grant execute on function public.review_crm_export(uuid,boolean,text,text) to authenticated;

create function public.revoke_crm_export(request_id uuid,revoke_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.crm_export_requests;
begin
 p:=private.crm_export_actor();select * into r from public.crm_export_requests where id=request_id for update;
 if r.id is null or not (r.requester_id=p.id or p.role='owner' or (p.role='sales_manager' and p.team=r.scope_team)) then raise exception '无权撤回该申请'; end if;
 if r.status not in ('pending','approved') then raise exception '申请已结束，已下载文件无法收回'; end if;
 if char_length(btrim(coalesce(revoke_reason,''))) not between 8 and 1000 then raise exception '请填写撤回原因'; end if;
 update public.crm_export_requests set status='revoked' where id=r.id;
 insert into public.crm_export_events(request_id,actor_id,event_type,reason,metadata) values(r.id,p.id,'revoked',btrim(revoke_reason),jsonb_build_object('before_status',r.status,'after_status','revoked'));
end $$;
revoke all on function public.revoke_crm_export(uuid,text) from public,anon;
grant execute on function public.revoke_crm_export(uuid,text) to authenticated;

create function private.crm_export_csv_cell(value text) returns text
language sql immutable set search_path='' as $$
 select '"'||replace(case when coalesce(value,'') ~ '^[[:space:]]*[=+@-]' or coalesce(value,'') ~ '^[[:cntrl:]]'
 then ''''||coalesce(value,'') else coalesce(value,'') end,'"','""')||'"';
$$;
revoke all on function private.crm_export_csv_cell(text) from public,anon,authenticated;

create function public.consume_crm_export(request_id uuid) returns jsonb
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
   and ((a.stage='owner' and reviewer.role='owner') or (a.stage='manager' and reviewer.role='sales_manager' and reviewer.team=r.scope_team)))<>2 then
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
revoke all on function public.consume_crm_export(uuid) from public,anon;
grant execute on function public.consume_crm_export(uuid) to authenticated;
commit;
