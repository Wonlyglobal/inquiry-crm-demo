-- Approved: contact-unknown leads count as entries; conversion still requires contact.
begin;
do $$ begin
 if md5(pg_get_functiondef('public.record_sales_leads(jsonb,text)'::regprocedure))<>'13d697e7fe00c51a2650f5bff31566e7'
 or md5(pg_get_functiondef('public.convert_sales_lead(uuid)'::regprocedure))<>'abd3b7aaccafb5685173caf0b64909fc' then raise exception '线索接口版本已变化，停止迁移并重新核对'; end if;
end $$;
create or replace function private.sales_lead_optional(value text) returns text language sql immutable set search_path='' as $$
 select case when lower(btrim(coalesce(value,''))) ~ '^(无|暂无|未知|待确认|待补充|n/a|null|[-—–]+)$' then '' else btrim(coalesce(value,'')) end
$$;
revoke all on function private.sales_lead_optional(text) from public,anon,authenticated,service_role;
create or replace function public.record_sales_leads(rows jsonb, entry_method text default 'manual') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); r jsonb; saved private.sales_leads; ids jsonb:='[]'; fp text; d date; row_no integer:=1; today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
begin
 if a.role<>'sales' then raise exception '仅业务员可以录入本人线索'; end if;
 if entry_method not in('manual','excel') or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception '每批需包含1—200条线索'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));
 perform private.sales_lead_day(a.id,today);
 for r in select value from jsonb_array_elements(rows) loop
  row_no:=row_no+1;
  r:=r||jsonb_build_object('email',private.sales_lead_optional(r->>'email'),'phone',private.sales_lead_optional(r->>'phone'),'contact',private.sales_lead_optional(r->>'contact'));
  if jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r) k where k not in('request_id','acquired_on','company','contact','country','email','phone','source','demand')) then raise exception '线索字段不正确'; end if;
  if length(coalesce(r->>'company',''))+length(coalesce(r->>'contact',''))=0 or nullif(btrim(r->>'country'),'') is null or length(btrim(coalesce(r->>'demand',''))) not between 4 and 10000 then raise exception '第%行：请补齐客户/联系人、国家和至少4字需求',row_no; end if;
  if length(r::text)>16000 or length(coalesce(r->>'company',''))>300 or length(coalesce(r->>'contact',''))>200 then raise exception '线索内容超长'; end if;
  if coalesce(r->>'email','')<>'' and (r->>'email') !~ '^[^[:space:]@;；,，<>]+@[^[:space:]@;；,，<>]+[.][^[:space:]@;；,，<>]+$' then raise exception '第%行：邮箱格式不正确，每格只填一个邮箱，未知可留空',row_no; end if;
  if (r->>'source') is null or (r->>'source') not in('whatsapp','wechat','phone','exhibition','website','email','social_media','offline_visit','dealer_referral','customer_referral','internal_referral','outbound','other') then raise exception '客户来源不正确'; end if;
  d:=(r->>'acquired_on')::date;
  if d is null or d>today or d<today-3650 then raise exception '获取日期应为今天或过去10年内'; end if;
  fp:=md5(lower(concat_ws('|',btrim(r->>'company'),btrim(r->>'contact'),btrim(r->>'email'),regexp_replace(coalesce(r->>'phone',''),'[^0-9+]','','g'),btrim(r->>'demand'),d::text)));
  select * into saved from private.sales_leads l where sales_id=a.id and (request_id=(r->>'request_id')::uuid or fingerprint=fp or md5(lower(concat_ws('|',btrim(l.company),btrim(l.contact),btrim(l.email),regexp_replace(l.phone,'[^0-9+]','','g'),btrim(l.demand),l.acquired_on::text)))=fp) limit 1;
  if saved.id is null then
   insert into private.sales_leads(sales_id,acquired_on,company,contact,country,email,phone,source,demand,method,request_id,fingerprint)
   values(a.id,d,btrim(coalesce(r->>'company','')),btrim(coalesce(r->>'contact','')),btrim(r->>'country'),lower(btrim(coalesce(r->>'email',''))),btrim(coalesce(r->>'phone','')),r->>'source',btrim(r->>'demand'),entry_method,(r->>'request_id')::uuid,fp) returning * into saved;
   insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,saved.id,'recorded',jsonb_build_object('method',entry_method,'recorded_at',saved.recorded_at,'acquired_on',d));
  end if;
  ids:=ids||jsonb_build_array(jsonb_build_object('id',saved.id,'recorded_at',saved.recorded_at));
 end loop;
 return ids;
end $$;
create or replace function public.convert_sales_lead(target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); l private.sales_leads; result jsonb;
begin
 if a.role<>'sales' then raise exception '仅业务员可转化本人线索'; end if;
 select * into l from private.sales_leads where id=target_id and sales_id=a.id for update;
 if l.id is null then raise exception '线索不存在或不属于本人'; end if;
 if l.inquiry_id is not null then return jsonb_build_object('inquiry_id',l.inquiry_id,'deduplicated',true); end if;
 if private.sales_lead_optional(l.email)='' and private.sales_lead_optional(l.phone)='' then raise exception '请先补充邮箱或电话，再转为个人商机'; end if;
 result:=public.create_customer_opportunity(l.company,l.contact,nullif(l.email,''),nullif(l.phone,''),null,l.country,l.source,'每日客户线索转化',l.demand,null,null,null,null,null,null,false);
 if not exists(select 1 from public.inquiries where id=(result->>'inquiry_id')::uuid and owner_id=a.id) then raise exception '商机归属核对失败'; end if;
 update private.sales_leads set inquiry_id=(result->>'inquiry_id')::uuid,converted_at=clock_timestamp() where id=l.id;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,l.id,'converted',jsonb_build_object('inquiry_id',result->>'inquiry_id','source',l.source));
 return result;
end $$;

create function public.update_sales_lead_contact(target_id uuid,email_value text,phone_value text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); l private.sales_leads; e text:=lower(private.sales_lead_optional(email_value)); p text:=private.sales_lead_optional(phone_value); fp text;
begin
 if a.role<>'sales' then raise exception '仅业务员可补充本人未转化线索的联系方式'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));
 select * into l from private.sales_leads where id=target_id and sales_id=a.id for update;
 if l.id is null or l.inquiry_id is not null then raise exception '线索不存在、不属于本人或已转化，请在商机中维护'; end if;
 if length(e)>320 or length(p)>300 then raise exception '联系方式超长'; end if;
 if e<>'' and e !~ '^[^[:space:]@;；,，<>]+@[^[:space:]@;；,，<>]+[.][^[:space:]@;；,，<>]+$' then raise exception '邮箱格式不正确，每次只填一个'; end if;
 fp:=md5(lower(concat_ws('|',btrim(l.company),btrim(l.contact),e,regexp_replace(p,'[^0-9+]','','g'),btrim(l.demand),l.acquired_on::text)));
 if exists(select 1 from private.sales_leads where sales_id=a.id and id<>l.id and (fingerprint=fp or md5(lower(concat_ws('|',btrim(company),btrim(contact),btrim(email),regexp_replace(phone,'[^0-9+]','','g'),btrim(demand),acquired_on::text)))=fp)) then raise exception '补充后的联系方式与已有同一线索重复，请核对'; end if;
 update private.sales_leads set email=e,phone=p where id=l.id;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,l.id,'contact_updated',jsonb_build_object('email_present',e<>'','phone_present',p<>''));
 return jsonb_build_object('id',l.id,'recorded_at',l.recorded_at,'contact_pending',e='' and p='');
end $$;
revoke all on function public.update_sales_lead_contact(uuid,text,text) from public,anon,service_role;
grant execute on function public.update_sales_lead_contact(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
