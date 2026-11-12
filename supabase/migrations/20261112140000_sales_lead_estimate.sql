-- Optional original-currency estimate. Preserve original lead identity, dates, scopes and notifications.
begin;
do $$ begin
 if md5(pg_get_functiondef('public.record_sales_leads(jsonb,text)'::regprocedure))<>'e0eb3b12d4fda7217d33dcfb41bc7154'
 or md5(pg_get_functiondef('public.convert_sales_lead(uuid)'::regprocedure))<>'d1dcc0e0b5ebc4cacfe38325bac89f48'
 or md5(pg_get_functiondef('public.sales_lead_workspace(date,date)'::regprocedure))<>'d2fa72d9827649dc2164edfefae4eb6d' then raise exception '线索接口已变化，停止预计金额迁移'; end if;
end $$;
alter table private.sales_leads add column estimated_amount numeric(14,2),add column currency text;
alter table private.sales_leads add constraint sales_lead_estimate_valid check((estimated_amount is null and currency is null) or (estimated_amount is not null and estimated_amount>=0 and estimated_amount<=999999999999.99 and currency is not null and currency ~ '^[A-Z]{3}$'));
create function private.sales_lead_estimate(value text,currency_value text) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if nullif(btrim(value),'') is null then return null;end if;
 if value !~ '^[0-9]{1,12}([.][0-9]{1,2})?$' or coalesce(nullif(upper(btrim(currency_value)),''),'CNY') !~ '^[A-Z]{3}$' then raise exception '预计金额需为非负数，最多12位整数及2位小数，币种需为三位代码';end if;
 return value::numeric;
end $$;
revoke all on function private.sales_lead_estimate(text,text) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.record_sales_leads(rows jsonb, entry_method text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.profiles:=private.sales_lead_actor(); r jsonb; saved private.sales_leads; ids jsonb:='[]'; fp text; d date; row_no integer:=1; today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
begin
 if a.role<>'sales' then raise exception '仅业务员可以录入本人线索'; end if;
 if entry_method not in('manual','excel') or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception '每批需包含1—200条线索'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));
 perform private.sales_lead_day(a.id,today);
 for r in select value from jsonb_array_elements(rows) loop
  row_no:=row_no+1;
  r:=r||jsonb_build_object('email',private.sales_lead_optional(r->>'email'),'phone',private.sales_lead_optional(r->>'phone'),'contact',private.sales_lead_optional(r->>'contact'));
  if jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r) k where k not in('request_id','acquired_on','company','contact','country','email','phone','source','demand','estimated_amount','currency')) then raise exception '线索字段不正确'; end if;
  if length(coalesce(r->>'company',''))+length(coalesce(r->>'contact',''))=0 or nullif(btrim(r->>'country'),'') is null or length(btrim(coalesce(r->>'demand',''))) not between 4 and 10000 then raise exception '第%行：请补齐客户/联系人、国家和至少4字需求',row_no; end if;
  if length(r::text)>16000 or length(coalesce(r->>'company',''))>300 or length(coalesce(r->>'contact',''))>200 then raise exception '线索内容超长'; end if;
  if coalesce(r->>'email','')<>'' and (r->>'email') !~ '^[^[:space:]@;；,，<>]+@[^[:space:]@;；,，<>]+[.][^[:space:]@;；,，<>]+$' then raise exception '第%行：邮箱格式不正确，每格只填一个邮箱，未知可留空',row_no; end if;
  if (r->>'source') is null or (r->>'source') not in('whatsapp','wechat','phone','exhibition','website','email','social_media','offline_visit','dealer_referral','customer_referral','internal_referral','outbound','other') then raise exception '客户来源不正确'; end if;
  d:=(r->>'acquired_on')::date;
  if d is null or d>today or d<today-3650 then raise exception '获取日期应为今天或过去10年内'; end if;
  fp:=md5(lower(concat_ws('|',btrim(r->>'company'),btrim(r->>'contact'),btrim(r->>'email'),regexp_replace(coalesce(r->>'phone',''),'[^0-9+]','','g'),btrim(r->>'demand'),d::text)));
  select * into saved from private.sales_leads l where sales_id=a.id and (request_id=(r->>'request_id')::uuid or fingerprint=fp or md5(lower(concat_ws('|',btrim(l.company),btrim(l.contact),btrim(l.email),regexp_replace(l.phone,'[^0-9+]','','g'),btrim(l.demand),l.acquired_on::text)))=fp) limit 1;
  perform private.sales_lead_estimate(r->>'estimated_amount',r->>'currency');
  if saved.id is null then
   insert into private.sales_leads(sales_id,acquired_on,company,contact,country,email,phone,source,demand,method,request_id,fingerprint,estimated_amount,currency)
   values(a.id,d,btrim(coalesce(r->>'company','')),btrim(coalesce(r->>'contact','')),btrim(r->>'country'),lower(btrim(coalesce(r->>'email',''))),btrim(coalesce(r->>'phone','')),r->>'source',btrim(r->>'demand'),entry_method,(r->>'request_id')::uuid,fp,private.sales_lead_estimate(r->>'estimated_amount',r->>'currency'),case when nullif(btrim(r->>'estimated_amount'),'') is null then null else coalesce(nullif(upper(btrim(r->>'currency')),''),'CNY') end) returning * into saved;
   insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,saved.id,'recorded',jsonb_build_object('method',entry_method,'recorded_at',saved.recorded_at,'acquired_on',d,'estimated_amount',saved.estimated_amount,'currency',saved.currency));
  end if;
  ids:=ids||jsonb_build_array(jsonb_build_object('id',saved.id,'recorded_at',saved.recorded_at));
 end loop;
 return ids;
end $function$
;
CREATE OR REPLACE FUNCTION public.convert_sales_lead(target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.profiles:=private.sales_lead_actor(); l private.sales_leads; result jsonb;
begin
 if a.role<>'sales' then raise exception '仅业务员可转化本人线索'; end if;
 select * into l from private.sales_leads where id=target_id and sales_id=a.id for update;
 if l.id is null then raise exception '线索不存在或不属于本人'; end if;
 if l.inquiry_id is not null then return jsonb_build_object('inquiry_id',l.inquiry_id,'deduplicated',true); end if;
 if private.sales_lead_optional(l.email)='' and private.sales_lead_optional(l.phone)='' then raise exception '请先补充邮箱或电话，再转为个人商机'; end if;
 result:=public.create_customer_opportunity(l.company,l.contact,nullif(l.email,''),nullif(l.phone,''),null,l.country,l.source,'每日客户线索转化',l.demand,null,null,null,l.estimated_amount,l.currency,null,false);
 if not exists(select 1 from public.inquiries where id=(result->>'inquiry_id')::uuid and owner_id=a.id) then raise exception '商机归属核对失败'; end if;
 update private.sales_leads set inquiry_id=(result->>'inquiry_id')::uuid,converted_at=clock_timestamp() where id=l.id;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,l.id,'converted',jsonb_build_object('inquiry_id',result->>'inquiry_id','source',l.source));
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.sales_lead_workspace(from_day date, to_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.profiles:=private.sales_lead_actor(); people jsonb; leads jsonb; days jsonb; rules jsonb;
begin
 if $1 is null or $2 is null or $2<$1 or $2-$1>92 then raise exception '请选择不超过93天的周期'; end if;
 with visible as(select id,full_name,team from public.profiles p where p.role='sales' and p.active and not p.is_test_data and p.data_environment='production' and (a.role in('owner','marketing') or p.id=a.id or (a.role='sales_manager' and private.crm_manager_covers_user(a.id,p.id))))
 select coalesce(jsonb_agg(to_jsonb(v)),'[]') into people from visible v;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'sales_id',l.sales_id,'company',l.company,'contact',l.contact,'country',l.country,'email',l.email,'phone',l.phone,'source',l.source,'demand',l.demand,'method',l.method,'acquired_on',l.acquired_on,'recorded_at',l.recorded_at,'recorded_on',l.recorded_on,'converted_at',l.converted_at,'inquiry_id',l.inquiry_id,'progress_note',l.progress_note,'progress_at',l.progress_at,'stage',i.status,'estimated_amount',case when l.inquiry_id is null then l.estimated_amount else i.estimated_amount end,'currency',case when l.inquiry_id is null then l.currency else i.currency end) order by l.recorded_at desc),'[]') into leads
 from private.sales_leads l left join public.inquiries i on i.id=l.inquiry_id and (a.role in('owner','marketing') or i.owner_id=a.id or (a.role='sales_manager' and private.crm_manager_covers_user(a.id,i.owner_id))) where l.sales_id in(select (v->>'id')::uuid from jsonb_array_elements(people) v) and (l.recorded_on between $1 and $2 or (l.converted_at at time zone 'Asia/Shanghai')::date between $1 and $2);
 select coalesce(jsonb_agg(jsonb_build_object('sales_id',p->>'id','day',d::date,'daily_min',r.daily_min,'rule_id',r.id,'no_new_reason',s.no_new_reason,'declared_at',s.declared_at,'exempt_reason',s.exempt_reason,'exempt_at',s.exempt_at,'weekend',extract(isodow from d)>5)),'[]') into days
 from jsonb_array_elements(people) p cross join generate_series($1::timestamp,least($2,(clock_timestamp() at time zone 'Asia/Shanghai')::date)::timestamp,'1 day') d
 left join private.sales_lead_days s on s.sales_id=(p->>'id')::uuid and s.day=d::date
 join lateral(select * from private.sales_lead_rules where id=s.rule_id or (s.rule_id is null and effective_on<=d::date) order by effective_on desc limit 1) r on true;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.effective_on desc),'[]') into rules from private.sales_lead_rules r;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,a.id,'workspace_read',jsonb_build_object('from',$1,'to',$2,'lead_count',jsonb_array_length(leads),'people_count',jsonb_array_length(people)));
 return jsonb_build_object('actor',jsonb_build_object('id',a.id,'role',a.role),'people',people,'leads',leads,'days',days,'rules',rules,'timezone','Asia/Shanghai','as_of',clock_timestamp());
end $function$
;

create function public.update_sales_lead_estimate(target_id uuid,amount_value text,currency_value text default 'CNY') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); l private.sales_leads; amount numeric:=private.sales_lead_estimate(amount_value,currency_value); code text:=case when amount is null then null else coalesce(nullif(upper(btrim(currency_value)),''),'CNY') end;
begin
 if a.role<>'sales' then raise exception '仅业务员可修改本人未转化线索的预计金额';end if;
 perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));
 select * into l from private.sales_leads where id=target_id and sales_id=a.id for update;
 if l.id is null or l.inquiry_id is not null then raise exception '线索不存在、不属于本人或已转化，请在商机中维护';end if;
 if l.estimated_amount is not distinct from amount and l.currency is not distinct from code then return jsonb_build_object('id',l.id,'unchanged',true);end if;
 update private.sales_leads set estimated_amount=amount,currency=code where id=l.id;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,l.id,'estimate_updated',jsonb_build_object('before_amount',l.estimated_amount,'before_currency',l.currency,'after_amount',amount,'after_currency',code));
 return jsonb_build_object('id',l.id,'estimated_amount',amount,'currency',code,'recorded_at',l.recorded_at);
end $$;
revoke all on function public.update_sales_lead_estimate(uuid,text,text) from public,anon,service_role;
grant execute on function public.update_sales_lead_estimate(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
