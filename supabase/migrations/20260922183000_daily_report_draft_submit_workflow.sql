-- Separate reversible draft saves from the explicit daily-report submission.
alter table public.daily_sales_reports
  add column if not exists status text,
  add column if not exists draft_saved_at timestamptz;

update public.daily_sales_reports
set status=case when submitted_at is null then 'draft' else 'submitted' end
where status is null;

alter table public.daily_sales_reports alter column status set default 'draft';
alter table public.daily_sales_reports alter column status set not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='daily_sales_reports_status_check') then
    alter table public.daily_sales_reports add constraint daily_sales_reports_status_check check(status in('draft','submitted'));
  end if;
end $$;

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
  actor uuid:=auth.uid();
  actor_role public.crm_role;
  existing public.daily_sales_reports;
  saved public.daily_sales_reports;
  start_at timestamptz;
  end_at timestamptz;
  lead_count integer;
  followup_count integer;
begin
  if actor is null then raise exception '请先登录'; end if;
  select role into actor_role from public.profiles where id=actor and active and not coalesce(is_test_data,false);
  if actor_role is distinct from 'sales' then raise exception '仅业务员可保存或提交本人日报'; end if;
  if target_date is null or target_date>current_date+1 or target_date<current_date-interval '90 days' then raise exception '日报日期不在允许范围'; end if;
  start_at:=(target_date::timestamp at time zone 'Asia/Shanghai');
  end_at:=((target_date+1)::timestamp at time zone 'Asia/Shanghai');
  select count(*) into lead_count from public.inquiries where created_by=actor and not coalesce(excluded_from_dashboard,false) and created_at>=start_at and created_at<end_at;
  select count(*) into followup_count from public.follow_ups where author_id=actor and created_at>=start_at and created_at<end_at;
  select * into existing from public.daily_sales_reports where sales_id=actor and report_date=target_date for update;
  if not submit_report and existing.status='submitted' then raise exception '日报已提交，不能再保存为草稿'; end if;
  insert into public.daily_sales_reports(sales_id,report_date,new_leads_count,follow_up_count,key_progress,blockers,tomorrow_plan,status,draft_saved_at,submitted_at,updated_at)
  values(actor,target_date,lead_count,followup_count,nullif(btrim(key_progress_text),''),nullif(btrim(blockers_text),''),nullif(btrim(tomorrow_plan_text),''),case when submit_report then 'submitted' else 'draft' end,clock_timestamp(),case when submit_report then clock_timestamp() else null end,clock_timestamp())
  on conflict(sales_id,report_date) do update set
    new_leads_count=excluded.new_leads_count,follow_up_count=excluded.follow_up_count,key_progress=excluded.key_progress,blockers=excluded.blockers,tomorrow_plan=excluded.tomorrow_plan,status=excluded.status,draft_saved_at=excluded.draft_saved_at,submitted_at=case when submit_report then clock_timestamp() else public.daily_sales_reports.submitted_at end,updated_at=clock_timestamp()
  returning * into saved;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor,'daily_sales_report',saved.id,case when submit_report then 'daily_report_submitted' else 'daily_report_draft_saved' end,jsonb_build_object('status',existing.status,'submitted_at',existing.submitted_at),jsonb_build_object('status',saved.status,'report_date',saved.report_date,'new_leads_count',saved.new_leads_count,'follow_up_count',saved.follow_up_count),case when submit_report then '业务员二次确认后提交日报' else '业务员保存日报草稿' end);
  return jsonb_build_object('id',saved.id,'status',saved.status,'report_date',saved.report_date,'draft_saved_at',saved.draft_saved_at,'submitted_at',saved.submitted_at);
end $$;

revoke all on function public.save_or_submit_daily_report(date,text,text,text,boolean) from public,anon;
grant execute on function public.save_or_submit_daily_report(date,text,text,text,boolean) to authenticated,service_role;
