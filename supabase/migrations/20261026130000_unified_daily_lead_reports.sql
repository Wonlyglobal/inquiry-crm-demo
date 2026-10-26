-- Personal daily reports and the lead workspace share the same recording ledger.
-- Historical submitted snapshots are not recalculated, relabelled or backfilled.
begin;

do $$ begin
  -- The reviewed production SQL-editor deployment has compressed body whitespace.
  -- Its 533 SQL tokens (including quoted text), signature, defaults, SECURITY
  -- DEFINER and empty search_path are identical to the repository predecessor.
  -- Accept only these two exact definitions; unknown drift still aborts.
  if md5(pg_get_functiondef('public.save_or_submit_daily_report(date,text,text,text,boolean)'::regprocedure))
     not in ('fa92b2230dbbb701610d6c972f2d879c','fe6243936f8c6e25690ab045b3dc9628') then
    raise exception '日报接口已变化，停止迁移并重新核验调用方';
  end if;
end $$;

alter table public.daily_sales_reports
  add column converted_count integer not null default 0 check(converted_count >= 0),
  add column metric_basis text not null default 'legacy_inquiries_v1'
    check(metric_basis in('legacy_inquiries_v1','ledger_recorded_v1')),
  add column metrics_as_of timestamptz;

comment on column public.daily_sales_reports.new_leads_count is
  'metric_basis=ledger_recorded_v1 时，按本人线索台账 recorded_on（上海日期）及 metrics_as_of 截止统计；历史 legacy_inquiries_v1 保留原快照。';
comment on column public.daily_sales_reports.converted_count is
  'ledger_recorded_v1：本人线索台账在报告上海日期内转化的去重 inquiry_id 数；不与新增线索相加。legacy_inquiries_v1 的 0 不代表核实为零。';
comment on column public.daily_sales_reports.metrics_as_of is
  '本次草稿保存或首次提交统计的时间截止；历史快照未核验时为空，提交后不再刷新。';

create or replace function public.save_or_submit_daily_report(
  target_date date,
  key_progress_text text,
  blockers_text text,
  tomorrow_plan_text text,
  submit_report boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles := private.sales_lead_actor();
  existing public.daily_sales_reports;
  saved public.daily_sales_reports;
  today date := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  cutoff timestamptz;
  start_at timestamptz;
  end_at timestamptz;
  lead_count integer;
  conversion_count integer;
  followup_count integer;
begin
  if actor.role <> 'sales' then raise exception '仅业务员可保存或提交本人日报'; end if;
  if target_date is null or submit_report is null then raise exception '日报日期和提交状态不能为空'; end if;

  -- Serialize the absent-row case as well as updates before the first report read.
  perform pg_advisory_xact_lock(hashtextextended('daily-report:' || actor.id::text || ':' || target_date::text,0));
  select * into existing from public.daily_sales_reports
    where sales_id=actor.id and report_date=target_date for update;
  if coalesce(existing.is_simulated,false) then
    raise exception '模拟日报不可覆盖为正式日报';
  end if;
  if existing.status='submitted' then
    if not submit_report then raise exception '日报已提交，不能再保存为草稿'; end if;
    -- A retry returns the original snapshot, including legacy metrics and times.
    -- This branch is intentionally before the editable-date window check.
    return jsonb_build_object('id',existing.id,'status',existing.status,
      'report_date',existing.report_date,'draft_saved_at',existing.draft_saved_at,
      'submitted_at',existing.submitted_at,'new_leads_count',existing.new_leads_count,
      'converted_count',existing.converted_count,'follow_up_count',existing.follow_up_count,
      'metric_basis',existing.metric_basis,'metrics_as_of',existing.metrics_as_of,
      'deduplicated',true);
  end if;
  if existing.submitted_at is not null then
    raise exception '日报提交状态与时间冲突，请先核实，原记录未更改';
  end if;
  if target_date>today+1 or target_date<today-90 then raise exception '日报日期不在允许范围'; end if;

  cutoff := clock_timestamp();
  start_at := target_date::timestamp at time zone 'Asia/Shanghai';
  end_at := (target_date+1)::timestamp at time zone 'Asia/Shanghai';
  select count(*) into lead_count from private.sales_leads
    where sales_id=actor.id and recorded_on=target_date and recorded_at<=cutoff;
  select count(distinct inquiry_id) into conversion_count from private.sales_leads
    where sales_id=actor.id and inquiry_id is not null
      and converted_at>=start_at and converted_at<end_at and converted_at<=cutoff;
  select count(*) into followup_count from public.follow_ups
    where author_id=actor.id and created_at>=start_at and created_at<end_at and created_at<=cutoff;

  insert into public.daily_sales_reports(
    sales_id,report_date,new_leads_count,converted_count,follow_up_count,
    key_progress,blockers,tomorrow_plan,status,draft_saved_at,submitted_at,updated_at,
    metric_basis,metrics_as_of
  ) values(
    actor.id,target_date,lead_count,conversion_count,followup_count,
    nullif(btrim(key_progress_text),''),nullif(btrim(blockers_text),''),nullif(btrim(tomorrow_plan_text),''),
    case when submit_report then 'submitted' else 'draft' end,cutoff,
    case when submit_report then cutoff else null end,cutoff,'ledger_recorded_v1',cutoff
  )
  on conflict(sales_id,report_date) do update set
    new_leads_count=excluded.new_leads_count,converted_count=excluded.converted_count,
    follow_up_count=excluded.follow_up_count,key_progress=excluded.key_progress,
    blockers=excluded.blockers,tomorrow_plan=excluded.tomorrow_plan,status=excluded.status,
    draft_saved_at=excluded.draft_saved_at,submitted_at=excluded.submitted_at,
    updated_at=excluded.updated_at,metric_basis=excluded.metric_basis,metrics_as_of=excluded.metrics_as_of
  returning * into saved;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor.id,'daily_sales_report',saved.id,
    case when submit_report then 'daily_report_submitted' else 'daily_report_draft_saved' end,
    jsonb_build_object('status',existing.status,'submitted_at',existing.submitted_at,'metric_basis',existing.metric_basis),
    jsonb_build_object('status',saved.status,'report_date',saved.report_date,
      'new_leads_count',saved.new_leads_count,'converted_count',saved.converted_count,
      'follow_up_count',saved.follow_up_count,'metric_basis',saved.metric_basis,'metrics_as_of',saved.metrics_as_of),
    case when submit_report then '业务员二次确认后提交本人线索台账日报快照' else '业务员保存本人线索台账日报草稿' end);

  return jsonb_build_object('id',saved.id,'status',saved.status,'report_date',saved.report_date,
    'draft_saved_at',saved.draft_saved_at,'submitted_at',saved.submitted_at,
    'new_leads_count',saved.new_leads_count,'converted_count',saved.converted_count,
    'follow_up_count',saved.follow_up_count,'metric_basis',saved.metric_basis,'metrics_as_of',saved.metrics_as_of);
end $$;

revoke all on function public.save_or_submit_daily_report(date,text,text,text,boolean) from public,anon;
grant execute on function public.save_or_submit_daily_report(date,text,text,text,boolean) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
