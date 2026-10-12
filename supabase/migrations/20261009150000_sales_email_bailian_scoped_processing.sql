begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Email observations can be processed by the authenticated Edge Function only
-- for the requesting seller's own scope (or an authorized manager/owner).
alter table public.sales_email_analysis_results
  drop constraint if exists sales_email_analysis_results_provider_check;
alter table public.sales_email_analysis_results
  add constraint sales_email_analysis_results_provider_check
  check (provider in ('company_internal_ollama','aliyun_bailian'));

create or replace function public.claim_sales_email_analysis_job_for(
  target_actor_id uuid,
  target_salesperson_id uuid,
  target_period_start date
) returns public.sales_email_analysis_jobs
language plpgsql security definer set search_path=''
as $$
declare
  actor_role text;
  actor_team text;
  salesperson_team text;
  item public.sales_email_analysis_jobs;
begin
  select p.role::text,p.team into actor_role,actor_team
    from public.profiles p where p.id=target_actor_id and p.active=true;
  select p.team into salesperson_team
    from public.profiles p where p.id=target_salesperson_id and p.role::text='sales' and p.active=true;
  if actor_role is null or salesperson_team is null then raise exception '账号不可用'; end if;
  if not (
    actor_role='owner'
    or (actor_role='sales' and target_actor_id=target_salesperson_id)
    or (actor_role='sales_manager' and actor_team is not distinct from salesperson_team)
  ) then raise exception '无权处理该业务员分析任务'; end if;

  update public.sales_email_analysis_jobs
    set status='failed',failure_code='processing_error'
    where salesperson_id=target_salesperson_id and period_start=target_period_start
      and status='processing' and attempts>=5
      and claimed_at<clock_timestamp()-interval '10 minutes';

  with next_job as (
    select j.id from public.sales_email_analysis_jobs j
    where j.salesperson_id=target_salesperson_id and j.period_start=target_period_start
      and j.attempts<5
      and (j.status='queued' or (j.status='processing' and j.claimed_at<clock_timestamp()-interval '10 minutes'))
    order by j.created_at,j.id for update skip locked limit 1
  )
  update public.sales_email_analysis_jobs j
    set status='processing',claimed_at=clock_timestamp(),attempts=j.attempts+1,failure_code=null
    from next_job where j.id=next_job.id and j.attempts<5
    returning j.* into item;
  return item;
end $$;
revoke all on function public.claim_sales_email_analysis_job_for(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.claim_sales_email_analysis_job_for(uuid,uuid,date) to service_role;

create or replace function public.complete_sales_email_analysis_job(
  target_job_id uuid,
  target_actor_id uuid,
  target_model text,
  target_confidence numeric,
  target_analysis jsonb,
  target_evidence jsonb,
  target_audit_metadata jsonb
) returns void
language plpgsql security definer set search_path=''
as $$
declare item public.sales_email_analysis_jobs;
begin
  if (select auth.role())<>'service_role' then raise exception '仅受控分析服务可保存结果'; end if;
  select * into item from public.sales_email_analysis_jobs where id=target_job_id for update;
  if not found or item.status<>'processing' then raise exception '分析任务状态已变化'; end if;

  insert into public.sales_email_analysis_results(job_id,inquiry_id,salesperson_id,period_start,source_hash,provider,model,confidence,analysis,evidence)
  values(item.id,item.inquiry_id,item.salesperson_id,item.period_start,item.source_hash,'aliyun_bailian',target_model,target_confidence,target_analysis,target_evidence)
  on conflict(job_id) do nothing;
  update public.sales_email_analysis_jobs set status='completed',completed_at=clock_timestamp(),failure_code=null
    where id=item.id and status='processing';
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(target_actor_id,'inquiry',item.inquiry_id,'sales_email_body_analysis_generated',
    coalesce(target_audit_metadata,'{}'::jsonb)||jsonb_build_object('job_id',item.id,'salesperson_id',item.salesperson_id,'provider','aliyun_bailian'),
    '百炼仅处理服务端脱敏后的必要邮件片段；原文证据由CRM本地映射并供人工判断，未调整评分或排名');
end $$;
revoke all on function public.complete_sales_email_analysis_job(uuid,uuid,text,numeric,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_sales_email_analysis_job(uuid,uuid,text,numeric,jsonb,jsonb,jsonb) to service_role;

create or replace function public.fail_sales_email_analysis_job(
  target_job_id uuid,
  target_actor_id uuid,
  target_failure_code text
) returns void
language plpgsql security definer set search_path=''
as $$
declare item public.sales_email_analysis_jobs;
begin
  if (select auth.role())<>'service_role' then raise exception '仅受控分析服务可更新任务'; end if;
  if target_failure_code not in ('model_unavailable','model_invalid_output','source_changed','processing_error') then
    raise exception '失败代码无效';
  end if;
  select * into item from public.sales_email_analysis_jobs where id=target_job_id for update;
  if not found or item.status<>'processing' then raise exception '分析任务状态已变化'; end if;
  update public.sales_email_analysis_jobs set status='failed',failure_code=target_failure_code where id=item.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(target_actor_id,'inquiry',item.inquiry_id,'sales_email_body_analysis_failed',
    jsonb_build_object('job_id',item.id,'salesperson_id',item.salesperson_id,'provider','aliyun_bailian','failure_code',target_failure_code),
    '已记录邮件分析失败状态；未保存或改变评分、排名');
end $$;
revoke all on function public.fail_sales_email_analysis_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_sales_email_analysis_job(uuid,uuid,text) to service_role;

-- Retire the global worker claim RPC: new processing is scoped to an authenticated
-- actor and salesperson, not to a cross-team service poller.
drop function if exists public.claim_sales_email_analysis_job();

notify pgrst,'reload schema';
commit;
