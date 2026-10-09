begin;

alter table public.inquiries
  add column if not exists origin_channel text,
  add column if not exists submitted_for_assignment_at timestamptz;

comment on column public.inquiries.origin_channel is '人工或自动进入 CRM 的统一客户渠道；不替代营销归因明细。';
comment on column public.inquiries.submitted_for_assignment_at is '市场或管理员提交待主管分配的时间。';

create or replace function public.create_customer_opportunity(
  company_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  contact_whatsapp text,
  country_name text,
  source_channel text,
  source_detail_text text,
  demand_text text,
  product_text text default null,
  quantity_text text default null,
  opportunity_title text default null,
  estimated_value numeric default null,
  estimated_currency text default null,
  expected_purchase_date date default null,
  notify_manager boolean default true
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  actor public.profiles;
  normalized_email text:=nullif(lower(btrim(contact_email)),'');
  normalized_phone text:=nullif(regexp_replace(coalesce(contact_phone,''),'[^0-9+]','','g'),'');
  normalized_whatsapp text:=nullif(regexp_replace(coalesce(contact_whatsapp,''),'[^0-9+]','','g'),'');
  normalized_company text:=nullif(btrim(company_name),'');
  normalized_contact text:=nullif(btrim(contact_name),'');
  normalized_country text:=nullif(btrim(country_name),'');
  normalized_demand text:=nullif(btrim(demand_text),'');
  normalized_source text:=lower(btrim(source_channel));
  normalized_domain text;
  company_row public.companies;
  contact_row public.contacts;
  existing_inquiry public.inquiries;
  created_inquiry public.inquiries;
  assigned_owner uuid;
  created_status public.inquiry_status;
  created_title text;
  submitted_at timestamptz;
begin
  select * into actor from public.profiles
  where id=auth.uid() and active=true and not coalesce(is_test_data,false)
    and coalesce(data_environment,'production')='production';
  if actor.id is null then raise exception '当前账号不可用'; end if;
  if actor.role not in ('owner','marketing','sales') then
    raise exception '当前角色不能创建客户商机';
  end if;
  if normalized_source is null or normalized_source not in ('whatsapp','wechat','phone','exhibition','website','email','social_media','offline_visit','dealer_referral','customer_referral','internal_referral','outbound','other') then
    raise exception '请选择有效的客户来源渠道';
  end if;
  if normalized_company is null and normalized_contact is null then
    raise exception '请至少填写公司名称或联系人';
  end if;
  if normalized_email is null and normalized_phone is null and normalized_whatsapp is null then
    raise exception '请至少填写邮箱、电话或 WhatsApp 中的一项联系方式';
  end if;
  if normalized_country is null then raise exception '请填写国家/地区'; end if;
  if normalized_demand is null or length(normalized_demand)<4 then raise exception '需求摘要至少填写 4 个字符'; end if;
  if estimated_value is not null and estimated_value<0 then raise exception '预计金额不能为负数'; end if;
  if estimated_value is not null and nullif(btrim(estimated_currency),'') is null then raise exception '填写预计金额时必须选择币种'; end if;
  if length(coalesce(source_detail_text,''))>1000 or length(normalized_demand)>10000 then raise exception '输入内容超过长度限制'; end if;

  if normalized_email is not null then
    normalized_domain:=split_part(normalized_email,'@',2);
    if normalized_domain in ('gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','icloud.com','qq.com','163.com','126.com') then normalized_domain:=null; end if;
  end if;

  if normalized_email is not null then
    select c.* into contact_row from public.contacts c
    where lower(c.email)=normalized_email and not coalesce(c.is_test_data,false)
      and coalesce(c.data_environment,'production')='production'
    order by c.created_at limit 1;
  end if;
  if contact_row.id is null and normalized_whatsapp is not null then
    select c.* into contact_row from public.contacts c
    where regexp_replace(coalesce(c.whatsapp,''),'[^0-9+]','','g')=normalized_whatsapp
      and not coalesce(c.is_test_data,false) and coalesce(c.data_environment,'production')='production'
    order by c.created_at limit 1;
  end if;
  if contact_row.id is null and normalized_phone is not null then
    select c.* into contact_row from public.contacts c
    where regexp_replace(coalesce(c.phone,''),'[^0-9+]','','g')=normalized_phone
      and not coalesce(c.is_test_data,false) and coalesce(c.data_environment,'production')='production'
    order by c.created_at limit 1;
  end if;

  if contact_row.id is not null then
    select * into company_row from public.companies where id=contact_row.company_id;
  elsif normalized_domain is not null then
    select c.* into company_row from public.companies c where lower(c.domain)=normalized_domain
      and not coalesce(c.is_test_data,false) and coalesce(c.data_environment,'production')='production'
    order by c.created_at limit 1;
  end if;
  if company_row.id is null and normalized_company is not null then
    select c.* into company_row from public.companies c where lower(btrim(c.name))=lower(normalized_company)
      and not coalesce(c.is_test_data,false) and coalesce(c.data_environment,'production')='production'
    order by c.created_at limit 1;
  end if;

  if actor.role='sales' and company_row.id is not null and exists(
    select 1 from public.inquiries i where i.company_id=company_row.id
      and i.owner_id is not null and i.owner_id<>actor.id
      and i.status not in ('won','lost') and not coalesce(i.is_test_data,false)
      and coalesce(i.data_environment,'production')='production'
  ) then
    raise exception '客户可能已由其他业务员负责，请提交主管核查归属';
  end if;

  select i.* into existing_inquiry from public.inquiries i
  where i.created_by=actor.id and i.contact_id=contact_row.id
    and lower(coalesce(i.demand_summary,i.original_message,''))=lower(normalized_demand)
    and i.created_at>clock_timestamp()-interval '5 minutes'
  order by i.created_at desc limit 1;
  if existing_inquiry.id is not null then
    return jsonb_build_object('inquiry_id',existing_inquiry.id,'company_id',existing_inquiry.company_id,'contact_id',existing_inquiry.contact_id,'deduplicated',true,'assignment_status',case when existing_inquiry.owner_id is null then 'pending_assignment' else 'self_owned' end);
  end if;

  if company_row.id is null then
    insert into public.companies(id,name,domain,country,created_by,is_test_data,data_environment)
    values(gen_random_uuid(),coalesce(normalized_company,normalized_contact,normalized_email,normalized_phone,normalized_whatsapp),normalized_domain,normalized_country,actor.id,false,'production')
    returning * into company_row;
  elsif company_row.country is null then
    update public.companies set country=normalized_country,updated_at=clock_timestamp() where id=company_row.id returning * into company_row;
  end if;

  if contact_row.id is null then
    insert into public.contacts(id,company_id,full_name,email,phone,whatsapp,created_by,is_test_data,data_environment)
    values(gen_random_uuid(),company_row.id,normalized_contact,normalized_email,normalized_phone,normalized_whatsapp,actor.id,false,'production')
    returning * into contact_row;
  end if;

  assigned_owner:=case when actor.role='sales' then actor.id else null end;
  created_status:=case when actor.role='sales' then 'received'::public.inquiry_status else 'pending_assignment'::public.inquiry_status end;
  submitted_at:=case when actor.role in ('owner','marketing') then clock_timestamp() else null end;
  created_title:=left(coalesce(nullif(btrim(opportunity_title),''),concat_ws(' · ',company_row.name,nullif(btrim(product_text),'')),normalized_demand),500);

  insert into public.inquiries(
    id,company_id,contact_id,title,product_category,quantity,target_country,source,origin_channel,
    source_detail,original_message,demand_summary,primary_source,status,validity,owner_id,created_by,updated_by,
    estimated_amount,currency,expected_close_date,submitted_for_assignment_at,first_contact_due_at,
    last_change_reason,is_test_data,data_environment
  ) values(
    gen_random_uuid(),company_row.id,contact_row.id,created_title,nullif(btrim(product_text),''),nullif(btrim(quantity_text),''),
    normalized_country,normalized_source,normalized_source,nullif(btrim(source_detail_text),''),normalized_demand,normalized_demand,normalized_source,
    created_status,'valid',assigned_owner,actor.id,actor.id,estimated_value,upper(nullif(btrim(estimated_currency),'')),
    expected_purchase_date,submitted_at,case when actor.role='sales' then clock_timestamp()+interval '30 minutes' else null end,
    case when actor.role='sales' then '业务员登记自有多渠道客户商机' else '市场/管理员登记并提交主管分配' end,false,'production'
  ) returning * into created_inquiry;

  insert into public.inquiry_marketing_touches(inquiry_id,touch_at,channel,evidence_note,is_primary,created_by)
  values(created_inquiry.id,clock_timestamp(),normalized_source,
    coalesce(nullif(btrim(source_detail_text),''),'人工登记的客户来源'),true,actor.id);

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data)
  values(actor.id,'inquiry',created_inquiry.id,'multichannel_customer_opportunity_created',
    case when actor.role='sales' then '业务员登记自有客户并创建商机' else '登记客户商机并提交主管分配' end,
    jsonb_build_object('company_id',company_row.id,'contact_id',contact_row.id,'source',normalized_source,'owner_id',assigned_owner,'status',created_status,'contains_customer_content',true));

  if notify_manager and assigned_owner is null then
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    select p.id,created_inquiry.id,'assignment_requested','新客户商机待分配',left(created_title,500)
    from public.profiles p where p.active=true and p.role='sales_manager'
      and not coalesce(p.is_test_data,false) and coalesce(p.data_environment,'production')='production';
  end if;

  return jsonb_build_object('inquiry_id',created_inquiry.id,'company_id',company_row.id,'contact_id',contact_row.id,'deduplicated',false,'assignment_status',case when assigned_owner is null then 'pending_assignment' else 'self_owned' end);
end;
$$;

revoke all on function public.create_customer_opportunity(text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,date,boolean) from public,anon;
grant execute on function public.create_customer_opportunity(text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,date,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
