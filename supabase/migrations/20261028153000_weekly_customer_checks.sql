begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $$ begin
 if md5((select prosrc from pg_proc where oid='private.process_sales_lead_schedule(timestamptz)'::regprocedure))<>'860ed1c627a75a83046b1fe0f8b7cea1' then raise exception '调度定义变化，停止周核对迁移';end if;
 if md5((select prosrc from pg_proc where oid='private.process_sales_lead_division_table_v1(timestamptz)'::regprocedure))<>'1321e791fbeebf856123a00a0fcd2402' then raise exception '事业部周汇总定义变化，停止迁移';end if;
 if md5((select prosrc from pg_proc where oid='public.configure_sales_leads(date,integer,time,integer,time,text)'::regprocedure))<>'1184523a2510169f816386aba6b4a3d5' then raise exception '规则调用方变化，停止迁移';end if;
end $$;
create table private.weekly_customer_deadlines(
 id uuid primary key default gen_random_uuid(),effective_on date not null unique,due_at time not null,
 actor_id uuid,reason text not null,created_at timestamptz not null default clock_timestamp()
);
create table private.weekly_customer_checks(
 id uuid primary key default gen_random_uuid(),inquiry_id uuid not null references public.inquiries(id),sales_id uuid not null references public.profiles(id),
 week_start date not null,recorded_at timestamptz not null default clock_timestamp(),
 last_contact_on date,followup_result text,next_action text,unknown_fields text[] not null,
 source_snapshot jsonb not null,source_fingerprint text not null
);
create index weekly_customer_checks_lookup on private.weekly_customer_checks(sales_id,week_start,inquiry_id,recorded_at desc);
create index weekly_customer_checks_latest on private.weekly_customer_checks(sales_id,inquiry_id,recorded_at desc,id desc);
create table private.weekly_customer_snapshots(
 week_start date primary key,deadline_at timestamptz not null,as_of timestamptz not null,rule_id uuid not null references private.weekly_customer_deadlines(id),people jsonb not null
);
alter table private.weekly_customer_deadlines enable row level security;alter table private.weekly_customer_checks enable row level security;alter table private.weekly_customer_snapshots enable row level security;
revoke all on private.weekly_customer_deadlines,private.weekly_customer_checks,private.weekly_customer_snapshots from public,anon,authenticated,service_role;
create trigger weekly_customer_deadlines_immutable before update or delete on private.weekly_customer_deadlines for each row execute function private.reject_risk_event_mutation();
create trigger weekly_customer_checks_immutable before update or delete on private.weekly_customer_checks for each row execute function private.reject_risk_event_mutation();
create trigger weekly_customer_snapshots_immutable before update or delete on private.weekly_customer_snapshots for each row execute function private.reject_risk_event_mutation();
insert into private.weekly_customer_deadlines(effective_on,due_at,reason) values((clock_timestamp() at time zone 'Asia/Shanghai')::date+1,'17:00','负责人确认周五17:00前完成客户/商机核对，17:05汇总；未知可待确认，不回填历史');
create function private.weekly_customer_rule_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare due time;begin
 select due_at into due from private.weekly_customer_deadlines where effective_on<=new.effective_on order by effective_on desc limit 1;
 if due is not null and new.weekly_at<=due then raise exception '每周汇总必须晚于客户资料核对截止时间';end if;return new;
end $$;
create trigger sales_lead_weekly_due_guard before insert on private.sales_lead_rules for each row execute function private.weekly_customer_rule_guard();
create function public.configure_weekly_customer_rules(effective_on date,daily_min integer,remind_at time,weekly_day integer,weekly_at time,customer_due_at time,reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();result uuid;today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
begin
 if a.role not in('owner','marketing') or $1 is null or $1<=today or $1>today+366 or $6 is null or $5 is null or $5<=$6 or length(btrim(coalesce($7,''))) not between 4 and 1000 then raise exception '仅市场部/老板可设置明日起规则，汇总须晚于核对截止';end if;
 insert into private.weekly_customer_deadlines(effective_on,due_at,actor_id,reason) values($1,$6,a.id,btrim($7));
 result:=public.configure_sales_leads($1,$2,$3,$4,$5,$7);
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,result,'weekly_customer_rules_scheduled',jsonb_build_object('effective_on',$1,'due_at',$6,'dispatch_at',$5));return result;
end $$;
create function private.weekly_customer_source(i public.inquiries) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('stage',i.status,'estimated_amount',i.estimated_amount,'currency',i.currency,'expected_close_date',i.expected_close_date,'next_follow_up_at',i.next_follow_up_at);
$$;
create function public.submit_weekly_customer_check(target uuid,details jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();i public.inquiries;c private.weekly_customer_checks;unknown text[];contact_day date;result_text text;action_text text;stamp timestamptz:=clock_timestamp();today date:=(stamp at time zone 'Asia/Shanghai')::date;source jsonb;
begin
 if a.role<>'sales' then raise exception '仅业务员可提交本人本周核对，不能代报';end if;
 if jsonb_typeof(details) is distinct from 'object' or exists(select 1 from jsonb_object_keys(details) k where k not in('last_contact_on','followup_result','next_action','unknown_fields')) or length(details::text)>7000 then raise exception '核对字段无效';end if;
 if jsonb_typeof(details->'unknown_fields') is distinct from 'array' or jsonb_array_length(details->'unknown_fields')>3 then raise exception '请明确待确认项';end if;
 select coalesce(array_agg(distinct value),'{}') into unknown from jsonb_array_elements_text(details->'unknown_fields');
 if exists(select 1 from unnest(unknown) k where k is null or k not in('last_contact_on','followup_result','next_action')) then raise exception '待确认字段无效';end if;
 if exists(select 1 from unnest(array['last_contact_on','followup_result','next_action']) k where details?k and jsonb_typeof(details->k) not in('string','null')) or (nullif(details->>'last_contact_on','') is not null and (details->>'last_contact_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception '联系日期、结果和行动格式无效';end if;
 contact_day:=nullif(details->>'last_contact_on','')::date;result_text:=nullif(btrim(details->>'followup_result'),'');action_text:=nullif(btrim(details->>'next_action'),'');
 if ('last_contact_on'=any(unknown))<>(contact_day is null) or ('followup_result'=any(unknown))<>(result_text is null) or ('next_action'=any(unknown))<>(action_text is null) then raise exception '空值须明确标为待确认；已填值不同时标待确认';end if;
 if contact_day>today or contact_day<'1970-01-01'::date or (result_text is not null and length(result_text) not between 4 and 2000) or (action_text is not null and length(action_text) not between 4 and 1000) then raise exception '联系日期不可在未来，结果4—2000字、行动4—1000字';end if;
 select * into i from public.inquiries where id=target and owner_id=a.id and status::text not in('won','lost') and validity::text is distinct from 'invalid' and created_at<=stamp and not coalesce(excluded_from_dashboard,false) and not coalesce(is_test_data,false) and data_environment='production' for share;
 if i.id is null then raise exception '非本人未关闭商机，不能核对';end if;
 if i.estimated_amount is null then unknown:=array_append(unknown,'estimated_amount');elsif nullif(btrim(i.currency),'') is null then unknown:=array_append(unknown,'currency');end if;if i.expected_close_date is null then unknown:=array_append(unknown,'expected_close_date');end if;
 source:=private.weekly_customer_source(i);stamp:=clock_timestamp();today:=(stamp at time zone 'Asia/Shanghai')::date;
 insert into private.weekly_customer_checks(inquiry_id,sales_id,week_start,recorded_at,last_contact_on,followup_result,next_action,unknown_fields,source_snapshot,source_fingerprint)
 values(i.id,a.id,date_trunc('week',today)::date,stamp,contact_day,result_text,action_text,unknown,source,md5(source::text)) returning * into c;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,c.id,'weekly_customer_checked',jsonb_build_object('inquiry_id',i.id,'week_start',c.week_start,'recorded_at',c.recorded_at,'unknown_fields',unknown,'source_fingerprint',c.source_fingerprint));
 return jsonb_build_object('id',c.id,'week_start',c.week_start,'recorded_at',c.recorded_at,'unknown_fields',unknown);
end $$;
create function private.weekly_customer_counts(target_ids uuid[],from_week date,cutoff timestamptz) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s) order by s.full_name,s.sales_id),'[]') from (
 select p.id sales_id,p.full_name,p.team,count(i.id)::integer total,
 count(distinct i.company_id)::integer customers,count(c.id)::integer reviewed,
 count(i.id)::integer-count(c.id)::integer pending,
 coalesce(sum(cardinality(c.unknown_fields)),0)::integer unknown_fields,
 case when count(i.id)=0 then null else round(100.0*count(c.id)/count(i.id),1) end rate,max(c.recorded_at) last_review_at
 from public.profiles p left join public.inquiries i on i.owner_id=p.id and i.status::text not in('won','lost') and i.validity::text is distinct from 'invalid' and not coalesce(i.excluded_from_dashboard,false) and not coalesce(i.is_test_data,false) and i.data_environment='production' and i.created_at<=cutoff
 left join lateral(select r.id,r.recorded_at,r.unknown_fields from private.weekly_customer_checks r where r.inquiry_id=i.id and r.sales_id=p.id and r.week_start=from_week and r.recorded_at<=cutoff order by r.recorded_at desc,r.id desc limit 1)c on true
 where p.id=any(target_ids) and p.role='sales' and p.active and not p.is_test_data and p.data_environment='production' group by p.id,p.full_name,p.team
 )s;
$$;
create function public.weekly_customer_workspace(week_day date default ((clock_timestamp() at time zone 'Asia/Shanghai')::date),target_sales uuid default null,page_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();ids uuid[];selected_ids uuid[];stamp timestamptz:=clock_timestamp();today date:=(stamp at time zone 'Asia/Shanghai')::date;start_day date:=date_trunc('week',week_day)::date;lead_rule private.sales_lead_rules;deadline_rule private.weekly_customer_deadlines;due_day date;due_stamp timestamptz;rows jsonb;people jsonb;total integer;historical jsonb;
begin
 if week_day is null or week_day<today-366 or week_day>today or page_offset is null or page_offset<0 or page_offset>20000 then raise exception '周日期或分页范围无效';end if;
 select array_agg(p.id) into ids from public.profiles p where p.active and p.role='sales' and not p.is_test_data and p.data_environment='production' and (a.role in('owner','marketing') or a.id=p.id or(a.role='sales_manager' and private.crm_manager_covers_user(a.id,p.id)));
 ids:=coalesce(ids,'{}');if target_sales is not null and not target_sales=any(ids) then raise exception '无权查看该业务员';end if;selected_ids:=case when target_sales is null then ids else array[target_sales] end;
 select dd::date into due_day from generate_series(start_day::timestamp,(start_day+6)::timestamp,interval '1 day') days(dd)
 join lateral(select r.weekly_day from private.sales_lead_rules r where r.effective_on<=dd::date order by r.effective_on desc limit 1) rr on rr.weekly_day=extract(isodow from dd) order by dd limit 1;
 select * into lead_rule from private.sales_lead_rules where effective_on<=due_day order by effective_on desc limit 1;
 due_day:=coalesce(due_day,start_day+4);
 select * into deadline_rule from private.weekly_customer_deadlines where effective_on<=due_day order by effective_on desc limit 1;
 due_stamp:=(due_day+coalesce(deadline_rule.due_at,'17:00'::time)) at time zone 'Asia/Shanghai';
 people:=private.weekly_customer_counts(selected_ids,start_day,least(stamp,due_stamp));
 select count(*)::integer into total from public.inquiries i where i.owner_id=any(selected_ids) and i.created_at<=stamp and i.status::text not in('won','lost') and i.validity::text is distinct from 'invalid' and not coalesce(i.excluded_from_dashboard,false) and not coalesce(i.is_test_data,false) and i.data_environment='production';
 rows:='[]';if a.role<>'marketing' then
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') into rows from (
 select i.id,i.title,i.owner_id,p.full_name,co.name company,i.created_at,private.weekly_customer_source(i) source,
 (select to_jsonb(r) - 'sales_id' - 'source_snapshot' from private.weekly_customer_checks r where r.inquiry_id=i.id and r.sales_id=i.owner_id order by r.recorded_at desc,r.id desc limit 1) last_check,
 exists(select 1 from private.weekly_customer_checks r where r.inquiry_id=i.id and r.sales_id=i.owner_id and r.week_start=start_day and r.source_fingerprint=md5(private.weekly_customer_source(i)::text)) current_values_checked
 from public.inquiries i join public.profiles p on p.id=i.owner_id left join public.companies co on co.id=i.company_id and not coalesce(co.is_test_data,false) and co.data_environment='production'
 where i.owner_id=any(selected_ids) and i.created_at<=stamp and i.status::text not in('won','lost') and i.validity::text is distinct from 'invalid' and not coalesce(i.excluded_from_dashboard,false) and not coalesce(i.is_test_data,false) and i.data_environment='production' order by i.created_at desc,i.id limit 100 offset page_offset
 )x;end if;
 select jsonb_build_object('deadline_at',s.deadline_at,'as_of',s.as_of,'people',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(s.people)e where (e->>'sales_id')::uuid=any(selected_ids))) into historical from private.weekly_customer_snapshots s where s.week_start=start_day;
 if historical is not null then people:=historical->'people';end if;
 if start_day<date_trunc('week',today)::date then rows:='[]';total:=0;if historical is null then people:='[]';end if;end if;
 if deadline_rule.id is null and historical is null then people:='[]';end if;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,a.id,'weekly_customer_workspace_read',jsonb_build_object('week_start',start_day,'people_count',cardinality(selected_ids),'item_count',jsonb_array_length(rows)));
 return jsonb_build_object('actor',jsonb_build_object('id',a.id,'role',a.role),'week_start',start_day,'as_of',stamp,'deadline_at',due_stamp,'dispatch_at',lead_rule.weekly_at,'deadline_effective_on',deadline_rule.effective_on,'history_unavailable',start_day<date_trunc('week',today)::date and historical is null,'rules',(select coalesce(jsonb_agg(to_jsonb(r) order by effective_on desc),'[]') from private.weekly_customer_deadlines r),'people',people,'items',rows,'total',case when a.role='marketing' then 0 else total end,'offset',page_offset,'can_submit',a.role='sales' and start_day=date_trunc('week',today)::date,'snapshot',historical);
end $$;
-- Frozen per-person rules can have an earlier historical weekly time. The
-- division queue must still wait for the currently approved global day/time.
do $$ declare definition text;begin
 select pg_get_functiondef('private.process_sales_lead_division_table_v1(timestamptz)'::regprocedure) into definition;
 if position('if not exists(select 1 from public.profiles p where p.role=''sales'' and p.active' in definition)=0 then raise exception '未找到事业部周汇总时间门禁位置';end if;
 execute replace(definition,'if not exists(select 1 from public.profiles p where p.role=''sales'' and p.active','if extract(isodow from d)=r.weekly_day and local_now::time>=r.weekly_at and not exists(select 1 from public.profiles p where p.role=''sales'' and p.active');
end $$;
alter function private.process_sales_lead_schedule(timestamptz) rename to process_sales_lead_customer_base_v1;
create function private.process_sales_lead_schedule(run_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;started timestamptz:=clock_timestamp();d date:=(run_at at time zone 'Asia/Shanghai')::date;v_week date:=date_trunc('week',d)::date;r private.sales_lead_rules;c private.weekly_customer_deadlines;ids uuid[];due timestamptz;people jsonb;
begin
 result:=private.process_sales_lead_customer_base_v1(run_at);if result->>'skipped' is not null then return result;end if;
 select * into r from private.sales_lead_rules where effective_on<=d order by effective_on desc limit 1;
 select * into c from private.weekly_customer_deadlines where effective_on<=d order by effective_on desc limit 1;
 if c.id is null or extract(isodow from d)<>r.weekly_day or (run_at at time zone 'Asia/Shanghai')::time<r.weekly_at then return result;end if;
 due:=(d+c.due_at) at time zone 'Asia/Shanghai';if run_at<due then return result;end if;
 select coalesce(array_agg(id),'{}') into ids from public.profiles where active and role='sales' and not is_test_data and data_environment='production';
 people:=private.weekly_customer_counts(ids,v_week,due);
 insert into private.weekly_customer_snapshots(week_start,deadline_at,as_of,rule_id,people) values(v_week,due,run_at,c.id,people) on conflict do nothing;
 update private.sales_lead_delivery q set card_data=coalesce(q.card_data,'{}')||jsonb_build_object('customer_updates',(select jsonb_build_object('deadline_at',s.deadline_at,'as_of',s.as_of,'people',s.people) from private.weekly_customer_snapshots s where s.week_start=v_week))
 where q.delivery_key='division-weekly:'||v_week and q.at>=started and q.sent_at is null and q.superseded_at is null and not (coalesce(q.card_data,'{}')?'customer_updates');
 return result;
end $$;
revoke all on function private.weekly_customer_rule_guard(),private.weekly_customer_source(public.inquiries),private.weekly_customer_counts(uuid[],date,timestamptz),private.process_sales_lead_schedule(timestamptz),private.process_sales_lead_customer_base_v1(timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.configure_weekly_customer_rules(date,integer,time,integer,time,time,text),public.submit_weekly_customer_check(uuid,jsonb),public.weekly_customer_workspace(date,uuid,integer) from public,anon,service_role;
grant execute on function public.configure_weekly_customer_rules(date,integer,time,integer,time,time,text),public.submit_weekly_customer_check(uuid,jsonb),public.weekly_customer_workspace(date,uuid,integer) to authenticated;
notify pgrst,'reload schema';commit;
