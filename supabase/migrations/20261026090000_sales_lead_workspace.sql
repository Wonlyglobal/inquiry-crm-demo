-- Dedicated lead ledger. No new SELECT policy on sales-private CRM tables.
begin;
do $$ begin
 if md5(pg_get_functiondef('public.create_customer_opportunity(text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,date,boolean)'::regprocedure))<>'84562c404e094a5690715c98e18d896b' then raise exception '商机接口已变化，停止迁移并重新核验调用方'; end if;
end $$;
create table private.sales_lead_rules(
 id uuid primary key default gen_random_uuid(), effective_on date not null unique,
 daily_min integer not null check(daily_min between 1 and 100), remind_at time not null,
 weekly_day integer not null check(weekly_day between 1 and 5), weekly_at time not null,
 created_at timestamptz not null default clock_timestamp(), actor_id uuid, reason text not null
);
insert into private.sales_lead_rules(effective_on,daily_min,remind_at,weekly_day,weekly_at,reason)
 values((clock_timestamp() at time zone 'Asia/Shanghai')::date,1,'17:00',5,'16:00','2026-10-26 项目负责人确认每日线索及周报规则');
create table private.sales_lead_days(
 sales_id uuid not null references public.profiles(id), day date not null,
 no_new_reason text, declared_at timestamptz, exempt_reason text, exempt_at timestamptz,
 rule_id uuid not null references private.sales_lead_rules(id), primary key(sales_id,day)
);
create table private.sales_leads(
 id uuid primary key default gen_random_uuid(), sales_id uuid not null references public.profiles(id),
 acquired_on date not null, recorded_at timestamptz not null default clock_timestamp(),
 recorded_on date not null default ((clock_timestamp() at time zone 'Asia/Shanghai')::date),
 company text not null default '', contact text not null default '', country text not null,
 email text not null default '', phone text not null default '', source text not null, demand text not null,
 method text not null check(method in('manual','excel')), request_id uuid not null,
 fingerprint text not null, inquiry_id uuid references public.inquiries(id), converted_at timestamptz,
 progress_note text, progress_at timestamptz,
 unique(sales_id,request_id), unique(sales_id,fingerprint)
);
create index sales_lead_period on private.sales_leads(sales_id,recorded_on);
create table private.sales_lead_events(
 id uuid primary key default gen_random_uuid(), actor_id uuid, target_id uuid, action text not null,
 at timestamptz not null default clock_timestamp(), details jsonb not null
);
create table private.sales_lead_delivery(
 id uuid primary key default gen_random_uuid(), delivery_key text not null unique,
 at timestamptz not null default clock_timestamp(), body text not null,
 claimed_at timestamptz, sent_at timestamptz, attempts integer not null default 0, last_error text
);
alter table private.sales_lead_rules enable row level security;
alter table private.sales_lead_days enable row level security;
alter table private.sales_leads enable row level security;
alter table private.sales_lead_events enable row level security;
alter table private.sales_lead_delivery enable row level security;
revoke all on private.sales_lead_rules,private.sales_lead_days,private.sales_leads,private.sales_lead_events,private.sales_lead_delivery from public,anon,authenticated,service_role;
create trigger sales_lead_events_immutable before update or delete on private.sales_lead_events for each row execute function private.reject_risk_event_mutation();
create trigger sales_lead_rules_immutable before update or delete on private.sales_lead_rules for each row execute function private.reject_risk_event_mutation();
create function private.sales_lead_actor() returns public.profiles language plpgsql stable security definer set search_path='' as $$
declare a public.profiles;
begin
 if coalesce(auth.jwt()->>'role','')='crm_marketing_readonly' or coalesce((auth.jwt()->'app_metadata'->>'crm_read_only')::boolean,false) then raise exception '只读账号不可进入线索工作台'; end if;
 select * into a from public.profiles where id=auth.uid() and active and not coalesce(is_test_data,false) and data_environment='production';
 if a.id is null or a.role not in('owner','marketing','sales_manager','sales') then raise exception '当前账号不能访问客户线索工作台'; end if;
 return a;
end $$;
create function private.sales_lead_day(target uuid,d date) returns void language sql security definer set search_path='' as $$
 insert into private.sales_lead_days(sales_id,day,rule_id)
 select target,d,id from private.sales_lead_rules where effective_on<=d order by effective_on desc limit 1
 on conflict do nothing;
$$;
create function public.record_sales_leads(rows jsonb, entry_method text default 'manual') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); r jsonb; saved private.sales_leads; ids jsonb:='[]'; fp text; d date; today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
begin
 if a.role<>'sales' then raise exception '仅业务员可以录入本人线索'; end if;
 if entry_method not in('manual','excel') or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception '每批需包含1—200条线索'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));
 perform private.sales_lead_day(a.id,today);
 for r in select value from jsonb_array_elements(rows) loop
  if jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r) k where k not in('request_id','acquired_on','company','contact','country','email','phone','source','demand')) then raise exception '线索字段不正确'; end if;
  if length(coalesce(r->>'company',''))+length(coalesce(r->>'contact',''))=0 or nullif(btrim(r->>'country'),'') is null or (nullif(btrim(r->>'email'),'') is null and nullif(btrim(r->>'phone'),'') is null) or length(btrim(coalesce(r->>'demand',''))) not between 4 and 10000 then raise exception '请补齐客户/联系人、国家、联系方式和至少4字需求'; end if;
  if length(r::text)>16000 or length(coalesce(r->>'company',''))>300 or length(coalesce(r->>'contact',''))>200 then raise exception '线索内容超长'; end if;
  if coalesce(r->>'email','')<>'' and (r->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception '邮箱格式不正确'; end if;
  if (r->>'source') is null or (r->>'source') not in('whatsapp','wechat','phone','exhibition','website','email','social_media','offline_visit','dealer_referral','customer_referral','internal_referral','outbound','other') then raise exception '客户来源不正确'; end if;
  d:=(r->>'acquired_on')::date;
  if d is null or d>today or d<today-3650 then raise exception '获取日期应为今天或过去10年内'; end if;
  fp:=md5(lower(concat_ws('|',btrim(r->>'company'),btrim(r->>'contact'),btrim(r->>'email'),regexp_replace(coalesce(r->>'phone',''),'[^0-9+]','','g'),btrim(r->>'demand'),d::text)));
  select * into saved from private.sales_leads where sales_id=a.id and (request_id=(r->>'request_id')::uuid or fingerprint=fp) limit 1;
  if saved.id is null then
   insert into private.sales_leads(sales_id,acquired_on,company,contact,country,email,phone,source,demand,method,request_id,fingerprint)
   values(a.id,d,btrim(coalesce(r->>'company','')),btrim(coalesce(r->>'contact','')),btrim(r->>'country'),lower(btrim(coalesce(r->>'email',''))),btrim(coalesce(r->>'phone','')),r->>'source',btrim(r->>'demand'),entry_method,(r->>'request_id')::uuid,fp) returning * into saved;
   insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,saved.id,'recorded',jsonb_build_object('method',entry_method,'recorded_at',saved.recorded_at,'acquired_on',d));
  end if;
  ids:=ids||jsonb_build_array(jsonb_build_object('id',saved.id,'recorded_at',saved.recorded_at));
 end loop;
 return ids;
end $$;
create function public.declare_no_sales_leads(target_day date, reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
begin
 if a.role<>'sales' or target_day is distinct from today or length(btrim(coalesce(reason,''))) not between 4 and 1000 then raise exception '仅可为本人今天提交无新增原因（4—1000字）'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));
 if exists(select 1 from private.sales_leads where sales_id=a.id and recorded_on=today) then raise exception '今天已有新增线索，无需提交无新增'; end if;
 perform private.sales_lead_day(a.id,today);
 update private.sales_lead_days set no_new_reason=btrim(reason),declared_at=clock_timestamp() where sales_id=a.id and day=today;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,a.id,'no_new_declared',jsonb_build_object('day',today,'reason',btrim(reason)));
end $$;
create function public.convert_sales_lead(target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); l private.sales_leads; result jsonb;
begin
 if a.role<>'sales' then raise exception '仅业务员可转化本人线索'; end if;
 select * into l from private.sales_leads where id=target_id and sales_id=a.id for update;
 if l.id is null then raise exception '线索不存在或不属于本人'; end if;
 if l.inquiry_id is not null then return jsonb_build_object('inquiry_id',l.inquiry_id,'deduplicated',true); end if;
 result:=public.create_customer_opportunity(l.company,l.contact,nullif(l.email,''),nullif(l.phone,''),null,l.country,l.source,'每日客户线索转化',l.demand,null,null,null,null,null,null,false);
 if not exists(select 1 from public.inquiries where id=(result->>'inquiry_id')::uuid and owner_id=a.id) then raise exception '商机归属核对失败'; end if;
 update private.sales_leads set inquiry_id=(result->>'inquiry_id')::uuid,converted_at=clock_timestamp() where id=l.id;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,l.id,'converted',jsonb_build_object('inquiry_id',result->>'inquiry_id','source',l.source));
 return result;
end $$;
create function public.configure_sales_leads(effective_on date,daily_min integer,remind_at time,weekly_day integer,weekly_at time,reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); result uuid;
begin
 if a.role not in('owner','marketing') or $1<=(clock_timestamp() at time zone 'Asia/Shanghai')::date or $1 is null or length(btrim(coalesce($6,''))) not between 4 and 1000 then raise exception '仅市场部/老板可修改明日起生效的规则，需填写原因'; end if;
 insert into private.sales_lead_rules(effective_on,daily_min,remind_at,weekly_day,weekly_at,actor_id,reason) values($1,$2,$3,$4,$5,a.id,btrim($6)) returning id into result;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,result,'rules_scheduled',jsonb_build_object('effective_on',$1,'daily_min',$2,'remind_at',$3,'weekly_day',$4,'weekly_at',$5,'reason',$6));
 return result;
end $$;
create function public.update_sales_lead_progress(target_id uuid,note text) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();
begin
 if a.role<>'sales' or length(btrim(coalesce(note,''))) not between 4 and 2000 then raise exception '仅业务员可更新本人商机的跟进摘要（4—2000字）'; end if;
 update private.sales_leads set progress_note=btrim(note),progress_at=clock_timestamp() where id=target_id and sales_id=a.id and inquiry_id is not null;
 if not found then raise exception '个人商机线索不存在'; end if;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,target_id,'progress_updated',jsonb_build_object('note',btrim(note)));
end $$;
create function public.exempt_sales_lead_day(sales_id uuid,target_day date,reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
begin
 if a.role not in('owner','marketing') or $2<today or $2>today+366 or $2 is null or length(btrim(coalesce($3,''))) not between 4 and 1000 then raise exception '仅市场部/老板可登记今天或未来的休假/节假日豁免及原因'; end if;
 if not exists(select 1 from public.profiles where id=$1 and role='sales' and active and not is_test_data and data_environment='production') then raise exception '业务员不可用'; end if;
 perform private.sales_lead_day($1,$2);
 update private.sales_lead_days set exempt_reason=btrim($3),exempt_at=clock_timestamp() where sales_lead_days.sales_id=$1 and day=$2;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,$1,'exempted',jsonb_build_object('day',$2,'reason',$3));
end $$;
create function public.sales_lead_workspace(from_day date,to_day date) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); people jsonb; leads jsonb; days jsonb; rules jsonb;
begin
 if $1 is null or $2 is null or $2<$1 or $2-$1>92 then raise exception '请选择不超过93天的周期'; end if;
 with visible as(select id,full_name,team from public.profiles p where p.role='sales' and p.active and not p.is_test_data and p.data_environment='production' and (a.role in('owner','marketing') or p.id=a.id or (a.role='sales_manager' and private.crm_manager_covers_user(a.id,p.id))))
 select coalesce(jsonb_agg(to_jsonb(v)),'[]') into people from visible v;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'sales_id',l.sales_id,'company',l.company,'contact',l.contact,'country',l.country,'email',l.email,'phone',l.phone,'source',l.source,'demand',l.demand,'method',l.method,'acquired_on',l.acquired_on,'recorded_at',l.recorded_at,'recorded_on',l.recorded_on,'converted_at',l.converted_at,'inquiry_id',l.inquiry_id,'progress_note',l.progress_note,'progress_at',l.progress_at,'stage',i.status,'estimated_amount',i.estimated_amount,'currency',i.currency) order by l.recorded_at desc),'[]') into leads
 from private.sales_leads l left join public.inquiries i on i.id=l.inquiry_id where l.sales_id in(select (v->>'id')::uuid from jsonb_array_elements(people) v) and (l.recorded_on between $1 and $2 or (l.converted_at at time zone 'Asia/Shanghai')::date between $1 and $2);
 select coalesce(jsonb_agg(jsonb_build_object('sales_id',p->>'id','day',d::date,'daily_min',r.daily_min,'rule_id',r.id,'no_new_reason',s.no_new_reason,'declared_at',s.declared_at,'exempt_reason',s.exempt_reason,'exempt_at',s.exempt_at,'weekend',extract(isodow from d)>5)),'[]') into days
 from jsonb_array_elements(people) p cross join generate_series($1::timestamp,least($2,(clock_timestamp() at time zone 'Asia/Shanghai')::date)::timestamp,'1 day') d
 left join private.sales_lead_days s on s.sales_id=(p->>'id')::uuid and s.day=d::date
 join lateral(select * from private.sales_lead_rules where id=s.rule_id or (s.rule_id is null and effective_on<=d::date) order by effective_on desc limit 1) r on true;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.effective_on desc),'[]') into rules from private.sales_lead_rules r;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,a.id,'workspace_read',jsonb_build_object('from',$1,'to',$2,'lead_count',jsonb_array_length(leads),'people_count',jsonb_array_length(people)));
 return jsonb_build_object('actor',jsonb_build_object('id',a.id,'role',a.role),'people',people,'leads',leads,'days',days,'rules',rules,'timezone','Asia/Shanghai','as_of',clock_timestamp());
end $$;
-- Explicit grants: private ledger stays inaccessible even to authenticated REST.
revoke all on function private.sales_lead_actor(),private.sales_lead_day(uuid,date) from public,anon,authenticated,service_role;
revoke all on function public.record_sales_leads(jsonb,text),public.declare_no_sales_leads(date,text),public.convert_sales_lead(uuid),public.configure_sales_leads(date,integer,time,integer,time,text),public.exempt_sales_lead_day(uuid,date,text),public.sales_lead_workspace(date,date) from public,anon,service_role;
grant execute on function public.record_sales_leads(jsonb,text),public.declare_no_sales_leads(date,text),public.convert_sales_lead(uuid),public.configure_sales_leads(date,integer,time,integer,time,text),public.exempt_sales_lead_day(uuid,date,text),public.sales_lead_workspace(date,date) to authenticated;
revoke all on function public.update_sales_lead_progress(uuid,text) from public,anon,service_role;
grant execute on function public.update_sales_lead_progress(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
