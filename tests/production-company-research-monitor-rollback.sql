begin;

do $$
declare
  target record;
  job_id uuid;
  before_facts jsonb;
  before_signals jsonb;
  monitor_result jsonb;
begin
  select i.id as inquiry_id,i.company_id into target
  from public.inquiries i
  where i.company_id is not null and coalesce(i.excluded_from_dashboard,false)=false
  order by i.created_at desc limit 1;
  if target.inquiry_id is null then raise exception '缺少可用于回滚验收的询盘'; end if;

  select confirmed_facts,demand_signals into before_facts,before_signals
  from public.companies where id=target.company_id;
  insert into public.company_research_jobs(company_id,inquiry_id,trigger_reason)
  values(target.company_id,target.inquiry_id,'production_rollback_acceptance') returning id into job_id;
  monitor_result:=private.assess_company_research(job_id);

  if monitor_result->>'status' not in ('current','stale','missing','conflict') then raise exception '背调监控未返回有效状态'; end if;
  if not (monitor_result ? 'evidence_count' and monitor_result ? 'conflicts' and monitor_result ? 'checked_at') then raise exception '背调监控结果不完整'; end if;
  if exists(select 1 from public.companies where id=target.company_id and (confirmed_facts is distinct from before_facts or demand_signals is distinct from before_signals)) then
    raise exception '背调监控不应改写已确认事实或需求信号';
  end if;
end;
$$;

rollback;
