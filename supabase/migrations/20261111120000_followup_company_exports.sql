-- Dedicated per-user company-wide export exception. Existing role/RLS and dual approvals unchanged.
begin;
create table private.company_export_grants(
 requester_id uuid primary key references public.profiles(id), approver_id uuid not null references public.profiles(id),
 requester_email text not null, approver_email text not null, active boolean not null default true,
 version integer not null default 1, reason text not null check(length(reason)>=8),
 approval_reference text not null check(length(approval_reference)>=8), check(requester_id<>approver_id)
);
create table private.company_export_requests(
 id uuid primary key default gen_random_uuid(), requester_id uuid not null, approver_id uuid not null,
 grant_version integer not null, requester_role text not null, approver_role text not null,
 purpose text not null, categories text[] not null, date_from date,date_to date,
 snapshot jsonb not null, snapshot_hash text not null, counts jsonb not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','revoked','consumed')),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
 download_expires_at timestamptz, consumed_at timestamptz
);
create table private.company_export_events(
 id bigint generated always as identity primary key, request_id uuid references private.company_export_requests(id),
 actor_id uuid, executor text not null default session_user, event_type text not null,
 reason text not null, metadata jsonb not null default '{}', created_at timestamptz not null default clock_timestamp()
);
alter table private.company_export_grants enable row level security;
alter table private.company_export_requests enable row level security;
alter table private.company_export_events enable row level security;
revoke all on private.company_export_grants,private.company_export_requests,private.company_export_events from public,anon,authenticated,service_role;
create trigger company_export_events_immutable before update or delete on private.company_export_events for each row execute function private.reject_risk_event_mutation();
create trigger company_export_requests_no_delete before delete on private.company_export_requests for each row execute function private.reject_risk_event_mutation();
create trigger company_export_grants_no_delete before delete on private.company_export_grants for each row execute function private.reject_risk_event_mutation();
create function private.protect_company_export() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='company_export_grants' then
  if tg_op='UPDATE' then
   if (new.requester_id,new.approver_id,new.requester_email,new.approver_email) is distinct from (old.requester_id,old.approver_id,old.requester_email,old.approver_email) then raise exception '授权不可改绑'; end if;
   new.version:=old.version+1;
  end if;
  insert into private.company_export_events(event_type,reason,metadata) values('grant_changed',new.reason,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 else
  if (new.id,new.requester_id,new.approver_id,new.grant_version,new.requester_role,new.approver_role,new.purpose,new.categories,new.date_from,new.date_to,new.snapshot,new.snapshot_hash,new.counts,new.created_at,new.expires_at)
    is distinct from (old.id,old.requester_id,old.approver_id,old.grant_version,old.requester_role,old.approver_role,old.purpose,old.categories,old.date_from,old.date_to,old.snapshot,old.snapshot_hash,old.counts,old.created_at,old.expires_at) then raise exception '导出快照不可修改'; end if;
 end if;
 return new;
end $$;
revoke all on function private.protect_company_export() from public,anon,authenticated,service_role;
create trigger company_export_grants_audit before insert or update on private.company_export_grants for each row execute function private.protect_company_export();
create trigger company_export_snapshot_immutable before update on private.company_export_requests for each row execute function private.protect_company_export();
create function private.company_export_check(target uuid) returns private.company_export_grants language plpgsql security definer set search_path='' as $$
declare g private.company_export_grants; who uuid;
begin
 select * into g from private.company_export_grants where requester_id=target and active for share;
 if g.requester_id is null or not exists(select 1 from public.profiles where id=g.requester_id and active and lower(email)=g.requester_email)
 or not exists(select 1 from public.profiles where id=g.approver_id and active and role='owner' and lower(email)=g.approver_email)
 then raise exception '导出授权不存在或账号已变化'; end if;
 for who in select x from unnest(array[g.requester_id,g.approver_id]) x order by x loop
  perform pg_advisory_xact_lock(hashtextextended('risk-control:'||who::text,0));
 end loop;
 if exists(select 1 from public.risk_user_controls where user_id in(g.requester_id,g.approver_id) and (export_suspended or download_suspended or sensitive_reveal_suspended)) then raise exception '风险控制暂停导出'; end if;
 return g;
end $$;
revoke all on function private.company_export_check(uuid) from public,anon,authenticated,service_role;
create function private.company_export_snapshot(kinds text[],d1 date,d2 date) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:='{}'; rows jsonb;
begin
 if 'customers'=any(kinds) then
 select coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','name',to_jsonb(t)->'name','domain',to_jsonb(t)->'domain','website',to_jsonb(t)->'website','country',to_jsonb(t)->'country','city',to_jsonb(t)->'city','company_type',to_jsonb(t)->'company_type','main_business',to_jsonb(t)->'main_business','employee_range',to_jsonb(t)->'employee_range','map_address',to_jsonb(t)->'map_address','created_at',to_jsonb(t)->'created_at','updated_at',to_jsonb(t)->'updated_at') order by t.id),'[]') into rows from public.companies t where not coalesce(t.is_test_data,false) and coalesce(t.data_environment,'production')='production' and (d1 is null or (t.created_at at time zone 'Asia/Shanghai')::date>=d1) and (d2 is null or (t.created_at at time zone 'Asia/Shanghai')::date<=d2);
 result:=result||jsonb_build_object('customers',rows); end if;
 if 'contacts'=any(kinds) then
 select coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','company_id',to_jsonb(t)->'company_id','full_name',to_jsonb(t)->'full_name','email',to_jsonb(t)->'email','phone',to_jsonb(t)->'phone','whatsapp',to_jsonb(t)->'whatsapp','job_title',to_jsonb(t)->'job_title','linkedin_url',to_jsonb(t)->'linkedin_url','created_at',to_jsonb(t)->'created_at','updated_at',to_jsonb(t)->'updated_at') order by t.id),'[]') into rows from public.contacts t where not coalesce(t.is_test_data,false) and coalesce(t.data_environment,'production')='production' and exists(select 1 from public.companies c where c.id=t.company_id and not coalesce(c.is_test_data,false) and coalesce(c.data_environment,'production')='production') and (d1 is null or (t.created_at at time zone 'Asia/Shanghai')::date>=d1) and (d2 is null or (t.created_at at time zone 'Asia/Shanghai')::date<=d2);
 result:=result||jsonb_build_object('contacts',rows); end if;
 if 'opportunities'=any(kinds) then
 select coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','inquiry_no',to_jsonb(t)->'inquiry_no','company_id',to_jsonb(t)->'company_id','contact_id',to_jsonb(t)->'contact_id','title',to_jsonb(t)->'title','product_category',to_jsonb(t)->'product_category','quantity',to_jsonb(t)->'quantity','target_country',to_jsonb(t)->'target_country','source',to_jsonb(t)->'source','source_detail',to_jsonb(t)->'source_detail','status',to_jsonb(t)->'status','validity',to_jsonb(t)->'validity','owner_id',to_jsonb(t)->'owner_id','created_by',to_jsonb(t)->'created_by','demand_summary',to_jsonb(t)->'demand_summary','project_name',to_jsonb(t)->'project_name','estimated_amount',to_jsonb(t)->'estimated_amount','currency',to_jsonb(t)->'currency','expected_close_date',to_jsonb(t)->'expected_close_date','probability',to_jsonb(t)->'probability','won_amount',to_jsonb(t)->'won_amount','won_currency',to_jsonb(t)->'won_currency','won_at',to_jsonb(t)->'won_at','lost_reason',to_jsonb(t)->'lost_reason','assigned_at',to_jsonb(t)->'assigned_at','first_valid_contact_at',to_jsonb(t)->'first_valid_contact_at','next_follow_up_at',to_jsonb(t)->'next_follow_up_at','created_at',to_jsonb(t)->'created_at','updated_at',to_jsonb(t)->'updated_at') order by t.id),'[]') into rows from public.inquiries t where not coalesce(t.is_test_data,false) and coalesce(t.data_environment,'production')='production' and t.archived_at is null and t.merged_into_id is null and not coalesce(t.excluded_from_dashboard,false) and (d1 is null or (t.created_at at time zone 'Asia/Shanghai')::date>=d1) and (d2 is null or (t.created_at at time zone 'Asia/Shanghai')::date<=d2);
 result:=result||jsonb_build_object('opportunities',rows); end if;
 if 'followups'=any(kinds) then
 select coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','inquiry_id',to_jsonb(t)->'inquiry_id','author_id',to_jsonb(t)->'author_id','method',to_jsonb(t)->'method','content',to_jsonb(t)->'content','customer_feedback',to_jsonb(t)->'customer_feedback','next_follow_up_at',to_jsonb(t)->'next_follow_up_at','created_at',to_jsonb(t)->'created_at','is_task',to_jsonb(t)->'is_task','completed_at',to_jsonb(t)->'completed_at','completion_status',to_jsonb(t)->'completion_status') order by t.id),'[]') into rows from public.follow_ups t where t.attribution_correction_id is null and exists(select 1 from public.inquiries i where i.id=t.inquiry_id and not coalesce(i.is_test_data,false) and coalesce(i.data_environment,'production')='production' and i.archived_at is null and i.merged_into_id is null and not coalesce(i.excluded_from_dashboard,false)) and (d1 is null or (t.created_at at time zone 'Asia/Shanghai')::date>=d1) and (d2 is null or (t.created_at at time zone 'Asia/Shanghai')::date<=d2);
 result:=result||jsonb_build_object('followups',rows); end if;
 if 'quotations'=any(kinds) then
 select coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','inquiry_id',to_jsonb(t)->'inquiry_id','version_no',to_jsonb(t)->'version_no','quote_no',to_jsonb(t)->'quote_no','subject',to_jsonb(t)->'subject','currency',to_jsonb(t)->'currency','total_amount',to_jsonb(t)->'total_amount','trade_terms',to_jsonb(t)->'trade_terms','validity_until',to_jsonb(t)->'validity_until','status',to_jsonb(t)->'status','created_by',to_jsonb(t)->'created_by','reviewed_by',to_jsonb(t)->'reviewed_by','reviewed_at',to_jsonb(t)->'reviewed_at','line_items',to_jsonb(t)->'line_items','created_at',to_jsonb(t)->'created_at','updated_at',to_jsonb(t)->'updated_at') order by t.id),'[]') into rows from public.quotation_versions t where exists(select 1 from public.inquiries i where i.id=t.inquiry_id and not coalesce(i.is_test_data,false) and coalesce(i.data_environment,'production')='production' and i.archived_at is null and i.merged_into_id is null and not coalesce(i.excluded_from_dashboard,false)) and (d1 is null or (t.created_at at time zone 'Asia/Shanghai')::date>=d1) and (d2 is null or (t.created_at at time zone 'Asia/Shanghai')::date<=d2);
 result:=result||jsonb_build_object('quotations',rows); end if;
 if 'leads'=any(kinds) then
 select coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(t)->'id','sales_id',to_jsonb(t)->'sales_id','acquired_on',to_jsonb(t)->'acquired_on','recorded_at',to_jsonb(t)->'recorded_at','recorded_on',to_jsonb(t)->'recorded_on','company',to_jsonb(t)->'company','contact',to_jsonb(t)->'contact','country',to_jsonb(t)->'country','email',to_jsonb(t)->'email','phone',to_jsonb(t)->'phone','source',to_jsonb(t)->'source','demand',to_jsonb(t)->'demand','method',to_jsonb(t)->'method','inquiry_id',to_jsonb(t)->'inquiry_id','converted_at',to_jsonb(t)->'converted_at','progress_note',to_jsonb(t)->'progress_note','progress_at',to_jsonb(t)->'progress_at') order by t.id),'[]') into rows from private.sales_leads t where exists(select 1 from public.profiles p where p.id=t.sales_id and not coalesce((to_jsonb(p)->>'is_test_data')::boolean,false) and coalesce(to_jsonb(p)->>'data_environment','production')='production') and (d1 is null or (t.recorded_at at time zone 'Asia/Shanghai')::date>=d1) and (d2 is null or (t.recorded_at at time zone 'Asia/Shanghai')::date<=d2);
 result:=result||jsonb_build_object('leads',rows); end if;
 return result;
end $$;
revoke all on function private.company_export_snapshot(text[],date,date) from public,anon,authenticated,service_role;
create function public.company_export_workspace(action text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.profiles; g private.company_export_grants; r private.company_export_requests;
 result jsonb; snap jsonb; counts jsonb; kinds text[]; d1 date; d2 date; why text; csv text; stamp text; dataset record; item jsonb; field record;
begin
 select * into me from public.profiles where id=auth.uid() and active;
 if me.id is null then raise exception '请先登录有效账号'; end if;
 select * into g from private.company_export_grants where active and (requester_id=me.id or approver_id=me.id);
 if g.requester_id is null then
  if action='list' then return jsonb_build_object('enabled',false); end if;
  raise exception '当前账号没有专用导出权限';
 end if;
 g:=private.company_export_check(g.requester_id);
 perform pg_advisory_xact_lock(hashtextextended('company-export:'||g.requester_id::text,0));
 if action='list' then
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]') into result from (
    select q.id,q.purpose,q.categories,q.date_from,q.date_to,q.counts,q.snapshot_hash,q.status,q.created_at,q.expires_at,q.download_expires_at,q.consumed_at,
      (select coalesce(jsonb_agg(jsonb_build_object('action',e.event_type,'actor',p.full_name,'at',e.created_at,'reason',e.reason) order by e.id),'[]') from private.company_export_events e left join public.profiles p on p.id=e.actor_id where e.request_id=q.id) as events
    from private.company_export_requests q where q.requester_id=g.requester_id and q.approver_id=g.approver_id order by q.created_at desc limit 100
  ) x;
  return jsonb_build_object('enabled',true,'requester',me.id=g.requester_id,'approver',me.id=g.approver_id,'requests',result);
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
  insert into private.company_export_requests(requester_id,approver_id,grant_version,requester_role,approver_role,purpose,categories,date_from,date_to,snapshot,snapshot_hash,counts)
  values(me.id,g.approver_id,g.version,me.role,(select role from public.profiles where id=g.approver_id),why,kinds,d1,d2,snap,encode(sha256(convert_to(snap::text,'UTF8')),'hex'),counts) returning * into r;
  insert into private.company_export_events(request_id,actor_id,event_type,reason,metadata) values(r.id,me.id,'requested',why,jsonb_build_object('counts',counts,'hash',r.snapshot_hash));
  return jsonb_build_object('id',r.id,'counts',counts);
 end if;
 select * into r from private.company_export_requests where id=(args->>'id')::uuid for update;
 if r.id is null or r.requester_id<>g.requester_id or r.approver_id<>g.approver_id then raise exception '无权处理该申请'; end if;
 if r.grant_version<>g.version or r.requester_role is distinct from (select role from public.profiles where id=g.requester_id)
 or r.approver_role is distinct from (select role from public.profiles where id=g.approver_id) then raise exception '授权或账号角色已变化，请重新申请'; end if;
 if action='preview' then
  if me.id<>g.approver_id then raise exception '仅审批人可核对待审批快照'; end if;
  if r.status not in('pending','approved') or r.expires_at<=clock_timestamp() then raise exception '申请已结束或过期'; end if;
  insert into private.company_export_events(request_id,actor_id,event_type,reason) values(r.id,me.id,'previewed','审批前核对固定字段快照');
  return jsonb_build_object('snapshot',r.snapshot,'hash',r.snapshot_hash);
 elsif action in('approve','reject','revoke') then
  if length(why) not between 8 and 1000 then raise exception '请填写8至1000字处理依据'; end if;
  if action<>'revoke' and me.id<>g.approver_id then raise exception '只有指定审批人可审批'; end if;
  if r.expires_at<=clock_timestamp() or (action='revoke' and r.status not in('pending','approved')) or (action<>'revoke' and r.status<>'pending') then raise exception '申请已处理或过期'; end if;
  if action<>'revoke' and args->>'hash' is distinct from r.snapshot_hash then raise exception '请先核对本次快照'; end if;
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
revoke all on function public.company_export_workspace(text,jsonb) from public,anon,service_role;
grant execute on function public.company_export_workspace(text,jsonb) to authenticated;
commit;
