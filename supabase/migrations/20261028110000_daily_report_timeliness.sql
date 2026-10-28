begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table private.daily_report_deadlines(
 id uuid primary key default gen_random_uuid(),effective_on date not null unique,deadline time not null,
 actor_id uuid,reason text not null,created_at timestamptz not null default clock_timestamp()
);
alter table private.daily_report_deadlines enable row level security;
revoke all on private.daily_report_deadlines from public,anon,authenticated,service_role;
create trigger daily_report_deadlines_immutable before update or delete on private.daily_report_deadlines for each row execute function private.reject_risk_event_mutation();
insert into private.daily_report_deadlines(effective_on,deadline,reason) values((clock_timestamp() at time zone 'Asia/Shanghai')::date,'18:00','项目负责人确认18:00日报截止，市场部可调整未来版本；旧日报不追溯');
create function public.configure_daily_report_deadline(effective_on date,deadline time,reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); result uuid;
begin
 if a.role not in('owner','marketing') or $1 is null or $1<=(clock_timestamp() at time zone 'Asia/Shanghai')::date or $2 is null or length(btrim(coalesce($3,''))) not between 4 and 1000 then raise exception '仅市场部/老板可设置明日起生效的截止时间，需填写原因';end if;
 insert into private.daily_report_deadlines(effective_on,deadline,actor_id,reason) values($1,$2,a.id,btrim($3)) returning id into result;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,result,'report_deadline_scheduled',jsonb_build_object('effective_on',$1,'deadline',$2,'reason',$3));return result;
end $$;
create function private.report_timeliness(ids uuid[],from_day date,to_day date,as_of timestamptz) returns jsonb language sql stable security definer set search_path='' as $$
 with roster as(select p.* from public.profiles p where p.id=any(ids) and p.role='sales' and p.active and not p.is_test_data and p.data_environment='production'),
 eligible as(
  select p.id,p.full_name,d::date as day,(d::date+r.deadline) at time zone 'Asia/Shanghai' due_at,
   x.submitted_at
  from roster p cross join generate_series(from_day::timestamp,least(to_day,(as_of at time zone 'Asia/Shanghai')::date)::timestamp,'1 day') d
  join lateral(select * from private.daily_report_deadlines where effective_on<=d::date order by effective_on desc limit 1) r on true
  left join private.sales_lead_days ds on ds.sales_id=p.id and ds.day=d::date
  left join public.daily_sales_reports x on x.sales_id=p.id and x.report_date=d::date and x.status='submitted' and not coalesce(x.is_simulated,false)
   and x.submitted_at>=(d::date::timestamp at time zone 'Asia/Shanghai') and x.submitted_at<=as_of
  where extract(isodow from d)<=5 and ds.exempt_reason is null
   and d::date>=coalesce(((to_jsonb(p)->>'created_at')::timestamptz at time zone 'Asia/Shanghai')::date,from_day)
   and exists(select 1 from private.sales_lead_rules lr where lr.effective_on<=d::date)
 ), counts as(
 select p.id sales_id,p.full_name,
  count(e.day) filter(where e.due_at<=as_of)::integer expected,
  count(e.day) filter(where e.due_at<=as_of and e.submitted_at<=e.due_at)::integer on_time,
  count(e.day) filter(where e.due_at<=as_of and e.submitted_at>e.due_at)::integer late,
  count(e.day) filter(where e.due_at<=as_of and e.submitted_at is null)::integer missing,
  count(e.day) filter(where e.due_at>as_of)::integer pending
 from roster p left join eligible e on e.id=p.id group by p.id,p.full_name
 ) select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('rate',case when expected>0 then round(on_time*100.0/expected,1) else null end) order by full_name,sales_id),'[]') from counts c;
$$;
create function public.daily_report_timeliness(from_day date,to_day date) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); ids uuid[]; stamp timestamptz:=clock_timestamp(); rules jsonb; people jsonb;
begin
 if $1 is null or $2 is null or $2<$1 or $2-$1>92 then raise exception '请选择不超过93天的周期';end if;
 select array_agg(p.id) into ids from public.profiles p where p.role='sales' and p.active and not p.is_test_data and p.data_environment='production'
 and(a.role in('owner','marketing') or p.id=a.id or(a.role='sales_manager' and private.crm_manager_covers_user(a.id,p.id)));
 people:=private.report_timeliness(ids,$1,$2,stamp);
 select coalesce(jsonb_agg(jsonb_build_object('effective_on',effective_on,'deadline',deadline) order by effective_on desc),'[]') into rules from private.daily_report_deadlines;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,a.id,'report_timeliness_read',jsonb_build_object('from',$1,'to',$2,'people_count',jsonb_array_length(people)));
 return jsonb_build_object('people',people,'rules',rules,'as_of',stamp,'timezone','Asia/Shanghai');
end $$;
revoke all on function private.report_timeliness(uuid[],date,date,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.daily_report_timeliness(date,date),public.configure_daily_report_deadline(date,time,text) from public,anon,service_role;
grant execute on function public.daily_report_timeliness(date,date),public.configure_daily_report_deadline(date,time,text) to authenticated;
alter table private.sales_lead_delivery add column card_data jsonb;
-- Source drift guard: only the already reviewed division scheduler is adapted.
do $$ declare definition text; begin
 select pg_get_functiondef('private.process_sales_lead_schedule(timestamptz)'::regprocedure) into definition;
 if md5((select prosrc from pg_proc where oid='private.process_sales_lead_schedule(timestamptz)'::regprocedure)) <> '74d8fcbafed5b5e67e67f8966c65a5dc' then raise exception '事业部调度定义变化，停止发布';end if;
 if position('local_now::time>=due_at then' in definition)=0 then raise exception '未找到每日截止条件';end if;
 definition:=replace(definition,'local_now::time>=due_at then','local_now::time>=greatest(due_at,coalesce((select deadline from private.daily_report_deadlines where effective_on<=d order by effective_on desc limit 1),due_at)) then');
 execute definition;
end $$;
alter function private.process_sales_lead_schedule(timestamptz) rename to process_sales_lead_division_table_v1;
create function private.process_sales_lead_schedule(run_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; started timestamptz:=clock_timestamp(); ids uuid[]; d date:=(run_at at time zone 'Asia/Shanghai')::date;
begin
 result:=private.process_sales_lead_division_table_v1(run_at);
 select array_agg(id) into ids from public.profiles where role='sales' and active and not is_test_data and data_environment='production';
 update private.sales_lead_delivery q set card_data=jsonb_build_object('version',1,'as_of',run_at,'timeliness',private.report_timeliness(ids,case when q.delivery_key like 'division-weekly:%' then date_trunc('week',d)::date else date_trunc('month',d)::date end,d,run_at))
 where q.at>=started and q.card_data is null and q.sent_at is null and q.superseded_at is null and (q.delivery_key='division-daily:'||d or q.delivery_key='division-weekly:'||date_trunc('week',d)::date);
 return result;
end $$;
-- Preserve existing retry/lease semantics and queue keys; return only stored snapshot metadata.
do $$ declare definition text;begin
 select pg_get_functiondef('public.claim_sales_lead_delivery()'::regprocedure) into definition;
 if md5((select prosrc from pg_proc where oid='public.claim_sales_lead_delivery()'::regprocedure))<>'25a90b69602122b7c447d8cdc034f479' or position('returning d.id,d.body' in definition)=0 then raise exception '派发函数变化，停止发布';end if;
 execute replace(definition,'returning d.id,d.body','returning d.id,d.body,d.card_data');
end $$;
revoke all on function private.process_sales_lead_schedule(timestamptz),private.process_sales_lead_division_table_v1(timestamptz) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
