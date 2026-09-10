-- Real-time, idempotent website lead intake with precise UTM/SEO attribution.

alter table public.inquiry_marketing_touches
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists referrer_url text,
  add column if not exists session_ref text;

create table if not exists public.website_intake_attempts(
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  status text not null default 'pending' check(status in ('pending','processing','completed','failed')),
  inquiry_id uuid references public.inquiries(id) on delete set null,
  request_payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check(attempts >= 0),
  last_error text,
  submitted_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  latency_ms integer,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists website_intake_attempts_status_received_idx
  on public.website_intake_attempts(status,received_at desc);
create index if not exists website_intake_attempts_inquiry_idx
  on public.website_intake_attempts(inquiry_id) where inquiry_id is not null;

alter table public.website_intake_attempts enable row level security;
drop policy if exists website_intake_attempts_manager_read on public.website_intake_attempts;
create policy website_intake_attempts_manager_read on public.website_intake_attempts
for select to authenticated
using(private.current_crm_role() in ('owner','sales_manager','marketing'));

revoke all on public.website_intake_attempts from anon,authenticated;
grant select on public.website_intake_attempts to authenticated;
grant select,insert,update,delete on public.website_intake_attempts to service_role;

create or replace function public.ingest_website_inquiry(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  submission_key text := left(nullif(btrim(payload->>'submission_id'),''),160);
  customer_email text := lower(left(nullif(btrim(payload->>'email'),''),320));
  customer_name text := left(nullif(btrim(payload->>'name'),''),200);
  company_name text := left(nullif(btrim(payload->>'company'),''),300);
  phone_value text := left(nullif(btrim(payload->>'phone'),''),100);
  job_title_value text := left(nullif(btrim(payload->>'job_title'),''),160);
  country_value text := left(nullif(btrim(payload->>'country'),''),160);
  product_value text := left(nullif(btrim(coalesce(payload->>'product',payload->>'product_category')),''),300);
  quantity_value text := left(nullif(btrim(payload->>'quantity'),''),120);
  message_value text := left(nullif(btrim(payload->>'message'),''),12000);
  landing_value text := left(nullif(btrim(payload->>'landing_page'),''),2000);
  referrer_value text := left(nullif(btrim(payload->>'referrer_url'),''),2000);
  session_value text := left(nullif(btrim(payload->>'session_ref'),''),160);
  utm_source_value text := left(nullif(btrim(payload->>'utm_source'),''),200);
  utm_medium_value text := left(nullif(btrim(payload->>'utm_medium'),''),200);
  utm_campaign_value text := left(nullif(btrim(payload->>'utm_campaign'),''),300);
  utm_content_value text := left(nullif(btrim(payload->>'utm_content'),''),300);
  utm_term_value text := left(nullif(btrim(payload->>'utm_term'),''),300);
  submitted_value timestamptz;
  actor_id uuid;
  attempt_id uuid;
  company_id_value uuid;
  contact_id_value uuid;
  inquiry_id_value uuid;
  attempt_status text;
  domain_value text;
  channel_value text := 'website';
  journey_item jsonb;
  journey_index integer := 0;
  process_finished timestamptz;
begin
  if submission_key is null then raise exception 'submission_id 不能为空'; end if;
  if customer_email is null or customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception '客户邮箱格式不正确';
  end if;
  if customer_name is null then raise exception '客户姓名不能为空'; end if;

  begin
    submitted_value := coalesce(nullif(payload->>'submitted_at','')::timestamptz,clock_timestamp());
  exception when others then
    submitted_value := clock_timestamp();
  end;
  if submitted_value > clock_timestamp()+interval '5 minutes' then submitted_value:=clock_timestamp(); end if;

  select p.id into actor_id from public.profiles p
  where p.active=true and p.role in ('marketing','owner','sales_manager')
  order by case p.role when 'marketing' then 1 when 'owner' then 2 else 3 end,p.created_at
  limit 1;
  if actor_id is null then raise exception '系统没有可用的市场接入账号'; end if;

  insert into public.website_intake_attempts(event_key,status,request_payload,submitted_at,attempts)
  values(submission_key,'pending',payload,submitted_value,0)
  on conflict(event_key) do nothing;

  select id,status,inquiry_id into attempt_id,attempt_status,inquiry_id_value
  from public.website_intake_attempts where website_intake_attempts.event_key=submission_key
  for update;

  if attempt_status='completed' and inquiry_id_value is not null then
    return jsonb_build_object('status','duplicate','inquiry_id',inquiry_id_value,'submission_id',submission_key);
  end if;

  update public.website_intake_attempts set status='processing',attempts=attempts+1,
    request_payload=payload,last_error=null,updated_at=clock_timestamp()
  where id=attempt_id;

  begin
    channel_value := case
      when lower(coalesce(utm_medium_value,'')) in ('cpc','ppc','paid','paid_search')
           and lower(coalesce(utm_source_value,'')) in ('google','googleads','google_ads') then 'google_ads'
      when lower(coalesce(utm_source_value,'')) in ('facebook','instagram','meta','meta_ads') then 'meta_ads'
      when lower(coalesce(utm_source_value,'')) in ('linkedin','linkedin_ads') then 'linkedin'
      when lower(coalesce(utm_medium_value,'')) in ('organic','organic_search','seo') then 'organic_search'
      when lower(coalesce(utm_medium_value,'')) in ('email','newsletter') then 'email'
      when lower(coalesce(utm_medium_value,'')) in ('referral','partner') then 'referral'
      else 'website'
    end;

    select c.id,c.company_id into contact_id_value,company_id_value
    from public.contacts c where lower(c.email)=customer_email
    order by c.created_at limit 1;

    domain_value:=split_part(customer_email,'@',2);
    if domain_value in ('gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','icloud.com','qq.com','163.com','126.com') then
      domain_value:=null;
    end if;

    if company_id_value is null and domain_value is not null then
      select c.id into company_id_value from public.companies c
      where lower(c.domain)=domain_value order by c.created_at limit 1;
    end if;
    if company_id_value is null and company_name is not null then
      select c.id into company_id_value from public.companies c
      where lower(c.name)=lower(company_name) order by c.created_at limit 1;
    end if;
    if company_id_value is null then
      insert into public.companies(name,domain,country,created_by)
      values(coalesce(company_name,domain_value,customer_email),domain_value,country_value,actor_id)
      returning id into company_id_value;
    else
      update public.companies set
        country=coalesce(country,country_value),
        updated_at=clock_timestamp()
      where id=company_id_value;
    end if;

    if contact_id_value is null then
      insert into public.contacts(company_id,full_name,email,phone,job_title,created_by)
      values(company_id_value,customer_name,customer_email,phone_value,job_title_value,actor_id)
      returning id into contact_id_value;
    end if;

    insert into public.inquiries(
      company_id,contact_id,title,product_category,quantity,target_country,
      source,source_detail,original_message,status,primary_source,
      contact_name,contact_job_title,demand_summary,created_by,updated_by,
      created_at,first_contact_due_at,last_change_reason
    ) values(
      company_id_value,contact_id_value,
      left('官网线索：'||coalesce(company_name,customer_name)||coalesce(' · '||product_value,''),500),
      product_value,quantity_value,country_value,'website',
      left(concat_ws(' / ',utm_source_value,utm_campaign_value,landing_value),1000),
      message_value,'pending_assignment',channel_value,customer_name,job_title_value,
      message_value,actor_id,actor_id,submitted_value,submitted_value+interval '10 minutes',
      '官网表单实时接入'
    ) returning id into inquiry_id_value;

    insert into public.inquiry_marketing_touches(
      inquiry_id,touch_at,channel,campaign_name,landing_page,evidence_note,is_primary,created_by,
      utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer_url,session_ref
    ) values(
      inquiry_id_value,submitted_value,channel_value,utm_campaign_value,landing_value,
      '官网表单自动归因',true,actor_id,
      utm_source_value,utm_medium_value,utm_campaign_value,utm_content_value,utm_term_value,
      referrer_value,session_value
    );

    if jsonb_typeof(payload->'journey_events')='array' then
      for journey_item in select value from jsonb_array_elements(payload->'journey_events') loop
        journey_index:=journey_index+1;
        exit when journey_index>100;
        if journey_item->>'event_name' in ('cta_click','form_open','form_start','form_submit','generate_lead','form_error','form_abandon','contact_click') then
          insert into public.inquiry_user_journey_events(
            inquiry_id,session_ref,event_name,event_at,sequence_no,page_path,page_title,
            cta_name,section_name,language,product_context,error_type
          ) values(
            inquiry_id_value,session_value,left(journey_item->>'event_name',40),
            case when nullif(journey_item->>'event_at','') is null then null else (journey_item->>'event_at')::timestamptz end,
            journey_index,left(journey_item->>'page_path',300),left(journey_item->>'page_title',160),
            left(journey_item->>'cta_name',120),left(journey_item->>'section_name',120),
            left(journey_item->>'language',20),left(journey_item->>'product_context',160),
            case when journey_item->>'event_name'='form_error' then left(journey_item->>'error_type',80) end
          );
        end if;
      end loop;
    end if;

    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    select p.id,inquiry_id_value,'new_inquiry_email','收到新的官网实时线索',
      left(customer_email||' · '||coalesce(company_name,customer_name),500)
    from public.profiles p where p.active=true and p.role='marketing';

    insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
    values(actor_id,'inquiry',inquiry_id_value,'website_realtime_intake',
      jsonb_build_object('submission_id',submission_key,'channel',channel_value,'utm_source',utm_source_value,
        'utm_medium',utm_medium_value,'utm_campaign',utm_campaign_value,'landing_page',landing_value),
      '官网表单实时接入并保存营销归因');

    process_finished:=clock_timestamp();
    update public.website_intake_attempts set status='completed',inquiry_id=inquiry_id_value,
      processed_at=process_finished,latency_ms=greatest(0,extract(epoch from (process_finished-submitted_value))*1000)::integer,
      last_error=null,updated_at=process_finished where id=attempt_id;
    return jsonb_build_object('status','completed','inquiry_id',inquiry_id_value,'submission_id',submission_key,
      'latency_ms',greatest(0,extract(epoch from (process_finished-submitted_value))*1000)::integer);
  exception when others then
    update public.website_intake_attempts set status='failed',last_error=left(sqlerrm,1200),
      processed_at=clock_timestamp(),updated_at=clock_timestamp() where id=attempt_id;
    return jsonb_build_object('status','failed','submission_id',submission_key,'error',left(sqlerrm,500));
  end;
end;
$$;

revoke all on function public.ingest_website_inquiry(jsonb) from public,anon,authenticated;
grant execute on function public.ingest_website_inquiry(jsonb) to service_role;

create or replace function public.retry_website_intake(target_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  retry_payload jsonb;
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then
    raise exception '无权限重试官网询盘接入';
  end if;
  select request_payload into retry_payload
  from public.website_intake_attempts
  where id=target_attempt_id and status='failed';
  if retry_payload is null then raise exception '仅失败的接入记录可以重试'; end if;
  return public.ingest_website_inquiry(retry_payload);
end;
$$;

revoke all on function public.retry_website_intake(uuid) from public,anon;
grant execute on function public.retry_website_intake(uuid) to authenticated;
