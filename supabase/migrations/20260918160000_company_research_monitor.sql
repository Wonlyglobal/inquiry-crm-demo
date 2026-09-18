-- Queue company research quality checks when inquiries enter CRM. The monitor
-- only records freshness/conflicts; it never promotes unverified facts.

alter table public.companies
  add column if not exists research_health jsonb not null default '{}'::jsonb,
  add column if not exists research_checked_at timestamptz,
  add column if not exists research_refresh_due_at timestamptz;

create table if not exists public.company_research_jobs(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete cascade,
  trigger_reason text not null default 'inquiry_created',
  status text not null default 'pending' check(status in ('pending','processing','completed','failed')),
  attempts integer not null default 0 check(attempts>=0),
  result jsonb not null default '{}'::jsonb,
  last_error text,
  queued_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists company_research_jobs_pending_idx
  on public.company_research_jobs(status,queued_at) where status in ('pending','failed');
create index if not exists company_research_jobs_company_idx
  on public.company_research_jobs(company_id,created_at desc);

alter table public.company_research_jobs enable row level security;
drop policy if exists company_research_jobs_visible on public.company_research_jobs;
create policy company_research_jobs_visible on public.company_research_jobs
for select to authenticated using(
  private.current_crm_role() in ('owner','sales_manager','marketing')
  or exists(select 1 from public.inquiries i where i.id=company_research_jobs.inquiry_id and i.owner_id=auth.uid())
);
revoke all on public.company_research_jobs from anon,authenticated;
grant select on public.company_research_jobs to authenticated;
grant select,insert,update,delete on public.company_research_jobs to service_role;

create or replace function private.assess_company_research(target_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  job public.company_research_jobs;
  company public.companies;
  inquiry public.inquiries;
  contact public.contacts;
  contact_domain text;
  company_domain text;
  evidence_count integer := 0;
  conflicts jsonb := '[]'::jsonb;
  reasons jsonb := '[]'::jsonb;
  source_time timestamptz;
  is_stale boolean := false;
  health_status text := 'current';
  monitor_result jsonb;
begin
  select * into job from public.company_research_jobs where id=target_job_id for update;
  if job.id is null then raise exception '背调任务不存在'; end if;
  update public.company_research_jobs set status='processing',attempts=attempts+1,started_at=clock_timestamp(),updated_at=clock_timestamp(),last_error=null where id=job.id;
  select * into company from public.companies where id=job.company_id;
  select * into inquiry from public.inquiries where id=job.inquiry_id;
  if inquiry.contact_id is not null then select * into contact from public.contacts where id=inquiry.contact_id; end if;

  company_domain:=lower(regexp_replace(regexp_replace(coalesce(company.domain,''),'^https?://','','i'),'^www\.','','i'));
  company_domain:=split_part(company_domain,'/',1);
  contact_domain:=lower(split_part(coalesce(contact.email,''),'@',2));
  evidence_count:=coalesce(jsonb_array_length(case when jsonb_typeof(company.confirmed_facts)='array' then company.confirmed_facts else '[]'::jsonb end),0)
    +coalesce(jsonb_array_length(case when jsonb_typeof(company.demand_signals)='array' then company.demand_signals else '[]'::jsonb end),0)
    +coalesce(jsonb_array_length(case when jsonb_typeof(company.research_evidence_sources)='array' then company.research_evidence_sources else '[]'::jsonb end),0);
  source_time:=coalesce(company.source_updated_at,company.researched_at,company.updated_at);
  is_stale:=source_time is null or source_time<clock_timestamp()-interval '90 days';

  if nullif(btrim(coalesce(company.name,'')),'') is null then reasons:=reasons||jsonb_build_array('缺少可核对的公司名称'); end if;
  if evidence_count=0 then reasons:=reasons||jsonb_build_array('尚无带来源的已确认事实或需求信号'); end if;
  if is_stale then reasons:=reasons||jsonb_build_array('背调来源已超过 90 天或缺少更新时间'); end if;
  if nullif(btrim(coalesce(inquiry.target_country,'')),'') is not null and nullif(btrim(coalesce(company.country,'')),'') is not null
     and lower(btrim(inquiry.target_country))<>lower(btrim(company.country)) then
    conflicts:=conflicts||jsonb_build_array(jsonb_build_object('type','country','message','询盘国家/地区与公司背调国家不一致','inquiry_value',inquiry.target_country,'company_value',company.country));
  end if;
  if contact_domain<>'' and company_domain<>''
     and contact_domain not in ('gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','icloud.com','qq.com','163.com','126.com','proton.me','protonmail.com')
     and contact_domain<>company_domain then
    conflicts:=conflicts||jsonb_build_array(jsonb_build_object('type','domain','message','联系人企业邮箱域名与公司域名不一致','contact_domain',contact_domain,'company_domain',company_domain));
  end if;

  health_status:=case when jsonb_array_length(conflicts)>0 then 'conflict' when evidence_count=0 then 'missing' when is_stale then 'stale' else 'current' end;
  monitor_result:=jsonb_build_object(
    'status',health_status,'checked_at',clock_timestamp(),'source_updated_at',source_time,
    'refresh_due_at',coalesce(source_time,clock_timestamp())+interval '90 days','stale',is_stale,
    'evidence_count',evidence_count,'conflict_count',jsonb_array_length(conflicts),
    'conflicts',conflicts,'reasons',reasons,'inquiry_id',inquiry.id
  );
  update public.companies set research_health=monitor_result,research_checked_at=clock_timestamp(),
    research_refresh_due_at=coalesce(source_time,clock_timestamp())+interval '90 days'
  where id=company.id;
  update public.company_research_jobs set status='completed',result=monitor_result,completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=job.id;
  return monitor_result;
end;
$$;
revoke all on function private.assess_company_research(uuid) from public,anon,authenticated;

create or replace function private.process_company_research_jobs(batch_size integer default 25)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  queued record;
  processed integer:=0;
begin
  for queued in
    select id from public.company_research_jobs
    where status='pending' or (status='failed' and attempts<3 and updated_at<clock_timestamp()-interval '10 minutes')
    order by queued_at for update skip locked limit greatest(1,least(coalesce(batch_size,25),100))
  loop
    begin
      perform private.assess_company_research(queued.id);
      processed:=processed+1;
    exception when others then
      update public.company_research_jobs set status='failed',attempts=attempts+1,last_error=left(sqlerrm,1000),updated_at=clock_timestamp() where id=queued.id;
    end;
  end loop;
  return processed;
end;
$$;
revoke all on function private.process_company_research_jobs(integer) from public,anon,authenticated;

create or replace function private.queue_company_research_on_inquiry()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.company_id is not null and not exists(
    select 1 from public.company_research_jobs j where j.company_id=new.company_id and j.status in ('pending','processing')
  ) then
    insert into public.company_research_jobs(company_id,inquiry_id,trigger_reason)
    values(new.company_id,new.id,case when tg_op='INSERT' then 'inquiry_created' else 'inquiry_identity_changed' end);
  end if;
  return new;
end;
$$;
revoke all on function private.queue_company_research_on_inquiry() from public,anon,authenticated;
drop trigger if exists inquiries_queue_company_research on public.inquiries;
create trigger inquiries_queue_company_research
after insert or update of company_id,target_country,contact_id on public.inquiries
for each row execute function private.queue_company_research_on_inquiry();

create or replace function public.refresh_inquiry_research_monitor(target_inquiry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid:=auth.uid();
  inquiry public.inquiries;
  job_id uuid;
begin
  select * into inquiry from public.inquiries where id=target_inquiry_id;
  if actor_id is null or inquiry.id is null or not exists(select 1 from public.profiles p where p.id=actor_id and p.active=true) then
    raise exception '无权检查该询盘背调';
  end if;
  if inquiry.company_id is null then raise exception '该询盘尚未关联公司，无法检查背调'; end if;
  if private.current_crm_role() not in ('owner','sales_manager','marketing') and inquiry.owner_id<>actor_id then
    raise exception '无权检查该询盘背调';
  end if;
  insert into public.company_research_jobs(company_id,inquiry_id,trigger_reason)
  values(inquiry.company_id,inquiry.id,'manual_health_refresh') returning id into job_id;
  return private.assess_company_research(job_id);
end;
$$;
revoke all on function public.refresh_inquiry_research_monitor(uuid) from public,anon;
grant execute on function public.refresh_inquiry_research_monitor(uuid) to authenticated;

create extension if not exists pg_cron with schema extensions;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='process-company-research-monitor-jobs';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('process-company-research-monitor-jobs','*/5 * * * *','select private.process_company_research_jobs(25)');
end;
$$;

insert into public.company_research_jobs(company_id,inquiry_id,trigger_reason)
select distinct on(i.company_id) i.company_id,i.id,'initial_monitor_backfill'
from public.inquiries i
where i.company_id is not null and coalesce(i.excluded_from_dashboard,false)=false
  and not exists(select 1 from public.company_research_jobs existing where existing.company_id=i.company_id)
order by i.company_id,i.created_at desc;
update public.company_research_jobs set status='pending',last_error=null,updated_at=clock_timestamp()
where status='failed' and last_error ilike '%result%ambiguous%';
select private.process_company_research_jobs(100);
