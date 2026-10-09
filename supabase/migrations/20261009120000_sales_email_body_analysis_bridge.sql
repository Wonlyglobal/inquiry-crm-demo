begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Human-reviewed, evidence-linked sales email observations. Email bodies are
-- never persisted in this queue/results schema and no score/rank is updated.
create table if not exists public.sales_email_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id),
  requested_by uuid not null references public.profiles(id),
  period_start date not null,
  source_hash text not null check (char_length(source_hash) between 32 and 64),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  claimed_at timestamptz,
  completed_at timestamptz,
  failure_code text check (failure_code is null or failure_code in ('model_unavailable','model_invalid_output','source_changed','processing_error')),
  created_at timestamptz not null default clock_timestamp(),
  unique(inquiry_id,period_start,source_hash)
);
create index if not exists sales_email_analysis_jobs_queue_idx
  on public.sales_email_analysis_jobs(status,created_at) where status in ('queued','processing');

create or replace function public.enqueue_sales_email_analysis_job(
  target_inquiry_id uuid,target_salesperson_id uuid,target_requested_by uuid,
  target_period_start date,target_source_hash text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare item_id uuid;
begin
  if (select auth.role())<>'service_role' then raise exception '仅受控分析服务可创建任务'; end if;
  insert into public.sales_email_analysis_jobs(inquiry_id,salesperson_id,requested_by,period_start,source_hash)
  values(target_inquiry_id,target_salesperson_id,target_requested_by,target_period_start,target_source_hash)
  on conflict(inquiry_id,period_start,source_hash) do update set
    requested_by=excluded.requested_by,
    status=case when sales_email_analysis_jobs.status in ('completed','processing') then sales_email_analysis_jobs.status else 'queued' end,
    attempts=case when sales_email_analysis_jobs.status in ('completed','processing') then sales_email_analysis_jobs.attempts else 0 end,
    claimed_at=case when sales_email_analysis_jobs.status in ('completed','processing') then sales_email_analysis_jobs.claimed_at else null end,
    failure_code=null
  returning id into item_id;
  return item_id;
end $$;
revoke all on function public.enqueue_sales_email_analysis_job(uuid,uuid,uuid,date,text) from public,anon,authenticated;
grant execute on function public.enqueue_sales_email_analysis_job(uuid,uuid,uuid,date,text) to service_role;

create table if not exists public.sales_email_analysis_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.sales_email_analysis_jobs(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id),
  period_start date not null,
  source_hash text not null,
  provider text not null check (provider='company_internal_ollama'),
  model text not null check (char_length(model) between 1 and 120),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  analysis jsonb not null check (jsonb_typeof(analysis)='object'),
  evidence jsonb not null check (jsonb_typeof(evidence)='array'),
  status text not null default 'pending_human_review' check (status in ('pending_human_review','accepted','rejected')),
  reviewed_by uuid references public.profiles(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists sales_email_analysis_results_scope_idx
  on public.sales_email_analysis_results(salesperson_id,period_start,created_at desc);

alter table public.sales_email_analysis_jobs enable row level security;
alter table public.sales_email_analysis_results enable row level security;

create or replace function private.sales_email_analysis_visible(target_salesperson uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.profiles actor
    join public.profiles salesperson on salesperson.id=target_salesperson
    where actor.id=(select auth.uid()) and actor.active=true and salesperson.active=true
      and (
        actor.role='owner'
        or (actor.role='sales' and actor.id=salesperson.id)
        or (actor.role='sales_manager' and actor.team is not distinct from salesperson.team)
      )
  );
$$;
revoke all on function private.sales_email_analysis_visible(uuid) from public,anon,authenticated;
grant execute on function private.sales_email_analysis_visible(uuid) to authenticated,service_role;

drop policy if exists sales_email_analysis_jobs_read on public.sales_email_analysis_jobs;
create policy sales_email_analysis_jobs_read on public.sales_email_analysis_jobs
  for select to authenticated using (private.sales_email_analysis_visible(salesperson_id));
drop policy if exists sales_email_analysis_results_read on public.sales_email_analysis_results;
create policy sales_email_analysis_results_read on public.sales_email_analysis_results
  for select to authenticated using (private.sales_email_analysis_visible(salesperson_id));
revoke all on public.sales_email_analysis_jobs,public.sales_email_analysis_results from public,anon,authenticated;
grant select on public.sales_email_analysis_jobs,public.sales_email_analysis_results to authenticated;
grant all on public.sales_email_analysis_jobs,public.sales_email_analysis_results to service_role;

create or replace function public.claim_sales_email_analysis_job()
returns public.sales_email_analysis_jobs
language plpgsql security definer set search_path=''
as $$
declare item public.sales_email_analysis_jobs;
begin
  if (select auth.role())<>'service_role' then raise exception '仅内网分析 worker 可领取任务'; end if;
  update public.sales_email_analysis_jobs
    set status='failed',failure_code='processing_error'
    where status='processing' and attempts>=5 and claimed_at<clock_timestamp()-interval '10 minutes';
  with next_job as (
    select id from public.sales_email_analysis_jobs
    where attempts<5 and (status='queued' or (status='processing' and claimed_at<clock_timestamp()-interval '10 minutes'))
    order by created_at,id for update skip locked limit 1
  )
  update public.sales_email_analysis_jobs j
  set status='processing',claimed_at=clock_timestamp(),attempts=j.attempts+1
  from next_job where j.id=next_job.id and j.attempts<5
  returning j.* into item;
  return item;
end $$;
revoke all on function public.claim_sales_email_analysis_job() from public,anon,authenticated;
grant execute on function public.claim_sales_email_analysis_job() to service_role;

create or replace function public.review_sales_email_analysis(
  target_result_id uuid,target_decision text,target_review_note text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); actor_role public.crm_role; item public.sales_email_analysis_results;
begin
  if target_decision not in ('accepted','rejected') then raise exception '审核结论无效'; end if;
  if char_length(btrim(coalesce(target_review_note,'')))<4 then raise exception '请填写人工判断说明'; end if;
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor_role not in ('owner','sales_manager') then raise exception '仅老板或主管可以审核'; end if;
  select * into item from public.sales_email_analysis_results where id=target_result_id for update;
  if not found then raise exception '分析结果不存在'; end if;
  if item.status<>'pending_human_review' then raise exception '该结果已审核'; end if;
  if not private.sales_email_analysis_visible(item.salesperson_id) then raise exception '无权审核该业务员结果'; end if;
  update public.sales_email_analysis_results set status=target_decision,reviewed_by=actor,
    review_note=btrim(target_review_note),reviewed_at=clock_timestamp() where id=item.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor,'inquiry',item.inquiry_id,'sales_email_analysis_human_reviewed',
    jsonb_build_object('result_id',item.id,'status',item.status),
    jsonb_build_object('result_id',item.id,'status',target_decision,'salesperson_id',item.salesperson_id),
    btrim(target_review_note));
  return jsonb_build_object('id',item.id,'status',target_decision,'reviewed_by',actor);
end $$;
revoke all on function public.review_sales_email_analysis(uuid,text,text) from public,anon;
grant execute on function public.review_sales_email_analysis(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
