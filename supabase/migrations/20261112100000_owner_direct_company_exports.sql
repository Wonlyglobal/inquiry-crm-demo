-- Explicit owner direct-export exception. No implicit role-wide entitlement.
begin;
alter table private.company_export_grants add column direct_download boolean not null default false;
alter table private.company_export_requests add column direct_download boolean not null default false;
alter table private.company_export_grants drop constraint company_export_grants_check;
alter table private.company_export_grants add constraint company_export_grants_approval_mode_check
 check ((direct_download and requester_id=approver_id) or (not direct_download and requester_id<>approver_id));
create or replace function private.protect_company_export() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='company_export_grants' then
  if tg_op='UPDATE' then
   if (new.requester_id,new.approver_id,new.requester_email,new.approver_email) is distinct from (old.requester_id,old.approver_id,old.requester_email,old.approver_email) then raise exception '授权不可改绑'; end if;
   new.version:=old.version+1;
  end if;
  insert into private.company_export_events(event_type,reason,metadata) values('grant_changed',new.reason,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 else
  if (new.direct_download,new.id,new.requester_id,new.approver_id,new.grant_version,new.requester_role,new.approver_role,new.purpose,new.categories,new.date_from,new.date_to,new.snapshot,new.snapshot_hash,new.counts,new.created_at,new.expires_at)
    is distinct from (old.direct_download,old.id,old.requester_id,old.approver_id,old.grant_version,old.requester_role,old.approver_role,old.purpose,old.categories,old.date_from,old.date_to,old.snapshot,old.snapshot_hash,old.counts,old.created_at,old.expires_at) then raise exception '导出快照不可修改'; end if;
 end if;
 return new;
end $$;
create or replace function private.company_export_check(target uuid) returns private.company_export_grants language plpgsql security definer set search_path='' as $$
declare g private.company_export_grants; who uuid;
begin
 select * into g from private.company_export_grants where requester_id=target and active for share;
 if g.requester_id is null or not exists(select 1 from public.profiles where id=g.requester_id and active and lower(email)=g.requester_email)
 or not exists(select 1 from public.profiles where id=g.approver_id and active and role='owner' and lower(email)=g.approver_email)
 or (g.direct_download and not exists(select 1 from public.profiles where id=g.requester_id and role='owner'))
 then raise exception '导出授权不存在或账号已变化'; end if;
 for who in select x from unnest(array[g.requester_id,g.approver_id]) x order by x loop
  perform pg_advisory_xact_lock(hashtextextended('risk-control:'||who::text,0));
 end loop;
 if exists(select 1 from public.risk_user_controls where user_id in(g.requester_id,g.approver_id) and (export_suspended or download_suspended or sensitive_reveal_suspended)) then raise exception '风险控制暂停导出'; end if;
 return g;
end $$;
create or replace function public.company_export_workspace(action text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.profiles; g private.company_export_grants; r private.company_export_requests;
 result jsonb; snap jsonb; counts jsonb; kinds text[]; d1 date; d2 date; why text; csv text; stamp text; dataset record; item jsonb; field record;
begin
 select * into me from public.profiles where id=auth.uid() and active;
 if me.id is null then raise exception '请先登录有效账号'; end if;
 if action not in('list','request') then
  select * into r from private.company_export_requests where id=(args->>'id')::uuid for update;
  if r.id is null or (me.id<>r.requester_id and me.id<>r.approver_id) then raise exception '无权处理该申请'; end if;
  select * into g from private.company_export_grants where active and requester_id=r.requester_id and approver_id=r.approver_id;
 else
  select * into g from private.company_export_grants where active and (requester_id=me.id or approver_id=me.id)
  order by (requester_id=me.id) desc,requester_id limit 1;
 end if;
 if g.requester_id is null then
  if action='list' then return jsonb_build_object('enabled',false); end if;
  raise exception '当前账号没有专用导出权限';
 end if;
 g:=private.company_export_check(g.requester_id);
 perform pg_advisory_xact_lock(hashtextextended('company-export:'||g.requester_id::text,0));
 if action='list' then
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]') into result from (
    select q.requester_id,q.approver_id,q.direct_download,(q.requester_id=me.id) as can_download,(q.approver_id=me.id and q.requester_id<>me.id and not q.direct_download) as can_approve,q.id,q.purpose,q.categories,q.date_from,q.date_to,q.counts,q.snapshot_hash,q.status,q.created_at,q.expires_at,q.download_expires_at,q.consumed_at,
      (select coalesce(jsonb_agg(jsonb_build_object('action',e.event_type,'actor',p.full_name,'at',e.created_at,'reason',e.reason) order by e.id),'[]') from private.company_export_events e left join public.profiles p on p.id=e.actor_id where e.request_id=q.id) as events
    from private.company_export_requests q join private.company_export_grants visible on visible.requester_id=q.requester_id and visible.approver_id=q.approver_id and visible.active where (q.requester_id=me.id or q.approver_id=me.id) order by q.created_at desc limit 100
  ) x;
  return jsonb_build_object('enabled',true,'requester',me.id=g.requester_id,'direct',me.id=g.requester_id and g.direct_download,'approver',exists(select 1 from private.company_export_grants where active and approver_id=me.id and requester_id<>me.id),'requests',result);
 end if;
 why:=btrim(coalesce(args->>'reason',''));
 if action='request' then
  if me.id<>g.requester_id then raise exception '仅被授权跟单账号可以申请'; end if;
  if length(why) not between 8 and 1000 then raise exception '请填写8至1000字导出用途'; end if;
  if (select count(*) from private.company_export_requests where requester_id=me.id and created_at>clock_timestamp()-interval '1 hour')>=5 then raise exception '每小时最多5次申请'; end if;
  if (select count(*) from private.company_export_requests where requester_id=me.id and status in('pending','approved') and expires_at>clock_timestamp())>=3 then raise exception '请先处理未完成申请'; end if;
  select array_agg(distinct x) into kinds from jsonb_array_elements_text(args->'categories') x;
  if kinds is null or cardinality(kinds)=0 or not kinds<@array['customers','contacts','opportunities','followups','quotations','leads'] then raise exception '请选择有效导出类别'; end if;
  d1:=nullif(args->>'from','')::date;d2:=nullif(args->>'to','')::date;
  if d1>d2 then raise exception '开始日期不能晚于结束日期'; end if;
  snap:=private.company_export_snapshot(kinds,d1,d2);
  if octet_length(snap::text)>20000000 then raise exception '数据超过20MB，请按周期或类别分批申请'; end if;
  select jsonb_object_agg(key,jsonb_array_length(value)) into counts from jsonb_each(snap);
  insert into private.company_export_requests(requester_id,approver_id,grant_version,requester_role,approver_role,purpose,categories,date_from,date_to,snapshot,snapshot_hash,counts,direct_download,status,download_expires_at)
  values(me.id,g.approver_id,g.version,me.role,(select role from public.profiles where id=g.approver_id),why,kinds,d1,d2,snap,encode(sha256(convert_to(snap::text,'UTF8')),'hex'),counts,g.direct_download,case when g.direct_download then 'approved' else 'pending' end,case when g.direct_download then clock_timestamp()+interval '10 minutes' else null end) returning * into r;
  insert into private.company_export_events(request_id,actor_id,event_type,reason,metadata) values(r.id,me.id,'requested',why,jsonb_build_object('counts',counts,'hash',r.snapshot_hash));
  if g.direct_download then
   insert into private.company_export_events(request_id,actor_id,event_type,reason,metadata) values(r.id,me.id,'direct_authorized','项目负责人批准指定账号直接导出，无审批动作',jsonb_build_object('hash',r.snapshot_hash,'grant_version',g.version));
  end if;
  return jsonb_build_object('id',r.id,'counts',counts,'direct',g.direct_download);
 end if;
 select * into r from private.company_export_requests where id=(args->>'id')::uuid for update;
 if r.id is null or r.requester_id<>g.requester_id or r.approver_id<>g.approver_id then raise exception '无权处理该申请'; end if;
 if r.direct_download is distinct from g.direct_download or r.grant_version<>g.version or r.requester_role is distinct from (select role from public.profiles where id=g.requester_id)
 or r.approver_role is distinct from (select role from public.profiles where id=g.approver_id) then raise exception '授权或账号角色已变化，请重新申请'; end if;
 if action='preview' then
  if me.id<>g.approver_id then raise exception '仅审批人可核对待审批快照'; end if;
  if r.status not in('pending','approved') or r.expires_at<=clock_timestamp() then raise exception '申请已结束或过期'; end if;
  insert into private.company_export_events(request_id,actor_id,event_type,reason) values(r.id,me.id,'previewed','审批前核对固定字段快照');
  return jsonb_build_object('snapshot',r.snapshot,'hash',r.snapshot_hash);
 elsif action in('approve','reject','revoke') then
  if length(why) not between 8 and 1000 then raise exception '请填写8至1000字处理依据'; end if;
  if action<>'revoke' and (me.id<>g.approver_id or me.id=r.requester_id or g.direct_download) then raise exception '只有指定审批人可审批'; end if;
  if r.expires_at<=clock_timestamp() or (action='revoke' and r.status not in('pending','approved')) or (action<>'revoke' and r.status<>'pending') then raise exception '申请已处理或过期'; end if;
  if action<>'revoke' and args->>'hash' is distinct from r.snapshot_hash then raise exception '请先核对本次快照'; end if;
  if action<>'revoke' and not exists(select 1 from private.company_export_events where request_id=r.id and actor_id=me.id and event_type='previewed') then raise exception '请先打开并核对本次快照'; end if;
  update private.company_export_requests set status=case action when 'approve' then 'approved' when 'reject' then 'rejected' else 'revoked' end,
   download_expires_at=case when action='approve' then least(expires_at,clock_timestamp()+interval '10 minutes') else null end where id=r.id;
  insert into private.company_export_events(request_id,actor_id,event_type,reason,metadata) values(r.id,me.id,action,why,jsonb_build_object('hash',r.snapshot_hash));
  return jsonb_build_object('ok',true);
 elsif action='download' then
  if me.id<>r.requester_id or r.status<>'approved' or r.download_expires_at is null or r.download_expires_at<=clock_timestamp() or r.expires_at<=clock_timestamp() then raise exception '未获批准、已过期或已领取'; end if;
  stamp:=r.id::text||' / '||me.full_name||' / '||clock_timestamp()::text||' / '||r.snapshot_hash;
  csv:='类别,记录ID,字段,值,导出追踪标识'||E'\r\n';
  for dataset in select key,value from jsonb_each(r.snapshot) order by key loop
   for item in select value from jsonb_array_elements(dataset.value) loop
    for field in select key,value from jsonb_each_text(item) order by key loop
     csv:=csv||private.crm_export_csv_cell(dataset.key)||','||private.crm_export_csv_cell(item->>'id')||','||private.crm_export_csv_cell(field.key)||','||private.crm_export_csv_cell(coalesce(field.value,''))||','||private.crm_export_csv_cell(stamp)||E'\r\n';
    end loop;
   end loop;
  end loop;
  update private.company_export_requests set status='consumed',consumed_at=clock_timestamp() where id=r.id;
  insert into private.company_export_events(request_id,actor_id,event_type,reason,metadata) values(r.id,me.id,'downloaded','领取一次性全范围导出',jsonb_build_object('hash',r.snapshot_hash,'counts',r.counts));
  return jsonb_build_object('filename','客户跟单导出-'||r.id::text||'.csv','csv',csv);
 end if;
 raise exception '不支持的操作';
end $$;
commit;
