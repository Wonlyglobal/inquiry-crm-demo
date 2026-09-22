-- User-approved production correction for Chloe Lee / 李铧燕.
-- The existing owner role is the system's full business-edit role.  Keep the
-- human-facing title explicit while preserving the existing audited owner
-- control paths instead of inventing a hidden permission bypass.

begin;

do $$
declare
  target_user constant uuid := 'c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
  before_profile jsonb;
  isolated_before bigint;
  isolated_after bigint;
begin
  select to_jsonb(p) into before_profile
  from public.profiles p
  where p.id=target_user
    and lower(p.email)='chloelee@wonlyglobal.com'
    and p.full_name='李铧燕'
    and p.active=true
    and not coalesce(p.is_test_data,false)
    and p.data_environment='production';

  if before_profile is null then
    raise exception '李铧燕生产账号与批准目标不一致，停止权限迁移';
  end if;

  select count(*) into isolated_before
  from public.inquiries
  where coalesce(excluded_from_dashboard,false) or coalesce(is_test_data,false);

  if isolated_before<>51 then
    raise exception '隔离询盘基线已变化（当前 %，批准基线 51），停止权限迁移',isolated_before;
  end if;

  update public.profiles
  set role='owner',team='运营部',job_title='运营经理',updated_at=clock_timestamp()
  where id=target_user;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(
    target_user,'profile',target_user,'operations_admin_access_granted',
    jsonb_build_object('role',before_profile->>'role','team',before_profile->>'team','job_title',before_profile->>'job_title'),
    jsonb_build_object('role','owner','team','运营部','job_title','运营经理','scope','all_business_edit'),
    '项目负责人确认李铧燕拥有全部编辑权限，界面职务显示运营经理；保留测试/无效询盘隔离'
  );

  select count(*) into isolated_after
  from public.inquiries
  where coalesce(excluded_from_dashboard,false) or coalesce(is_test_data,false);

  if isolated_after<>isolated_before then
    raise exception '权限迁移不得改变隔离询盘数量';
  end if;
end $$;

create table if not exists public.crm_data_health_snapshots (
  id bigint generated always as identity primary key,
  snapshot_date date not null unique,
  captured_at timestamptz not null default clock_timestamp(),
  counts jsonb not null check (jsonb_typeof(counts)='object'),
  previous_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_counts)='object'),
  anomalies jsonb not null default '[]'::jsonb check (jsonb_typeof(anomalies)='array'),
  status text not null check (status in ('baseline','healthy','warning'))
);

alter table public.crm_data_health_snapshots enable row level security;
revoke all on public.crm_data_health_snapshots from public,anon,authenticated;
grant select on public.crm_data_health_snapshots to authenticated;
grant all on public.crm_data_health_snapshots to service_role;

drop policy if exists crm_data_health_snapshots_owner_read on public.crm_data_health_snapshots;
create policy crm_data_health_snapshots_owner_read
on public.crm_data_health_snapshots for select to authenticated
using (private.current_crm_role()='owner');

create or replace function private.capture_crm_data_health_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  today date := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  current_counts jsonb;
  prior_counts jsonb := '{}'::jsonb;
  anomaly_list jsonb := '[]'::jsonb;
  metric text;
  current_value bigint;
  prior_value bigint;
  saved public.crm_data_health_snapshots;
  risk_id uuid;
begin
  select jsonb_build_object(
    'inquiries_total',(select count(*) from public.inquiries),
    'inquiries_operational',(select count(*) from public.inquiries where not coalesce(excluded_from_dashboard,false) and not coalesce(is_test_data,false)),
    'inquiries_isolated',(select count(*) from public.inquiries where coalesce(excluded_from_dashboard,false) or coalesce(is_test_data,false)),
    'companies',(select count(*) from public.companies),
    'contacts',(select count(*) from public.contacts),
    'email_intake',(select count(*) from public.email_intake),
    'email_messages',(select count(*) from public.email_messages),
    'email_templates',(select count(*) from public.email_templates),
    'sales_knowledge_articles',(select count(*) from public.sales_knowledge_articles),
    'follow_ups',(select count(*) from public.follow_ups),
    'profiles_active',(select count(*) from public.profiles where active and not coalesce(is_test_data,false)),
    'mailbox_connections',(select count(*) from public.mailbox_connections where status<>'disabled'),
    'whatsapp_messages',(select count(*) from public.whatsapp_messages)
  ) into current_counts;

  select s.counts into prior_counts
  from public.crm_data_health_snapshots s
  where s.snapshot_date<today
  order by s.snapshot_date desc
  limit 1;
  prior_counts:=coalesce(prior_counts,'{}'::jsonb);

  foreach metric in array array[
    'inquiries_total','inquiries_operational','companies','contacts','email_intake',
    'email_messages','email_templates','sales_knowledge_articles','follow_ups',
    'profiles_active','mailbox_connections','whatsapp_messages'
  ]
  loop
    current_value:=coalesce((current_counts->>metric)::bigint,0);
    prior_value:=coalesce((prior_counts->>metric)::bigint,0);
    if prior_value>=3 and current_value<prior_value and
       (current_value=0 or current_value*100<prior_value*80) then
      anomaly_list:=anomaly_list||jsonb_build_array(jsonb_build_object(
        'metric',metric,'previous',prior_value,'current',current_value,
        'decrease',prior_value-current_value,'threshold','20_percent_or_zero'
      ));
    end if;
  end loop;

  insert into public.crm_data_health_snapshots(snapshot_date,counts,previous_counts,anomalies,status)
  values(today,current_counts,prior_counts,anomaly_list,
    case when prior_counts='{}'::jsonb then 'baseline'
         when jsonb_array_length(anomaly_list)>0 then 'warning' else 'healthy' end)
  on conflict(snapshot_date) do update set
    captured_at=excluded.captured_at,
    counts=excluded.counts,
    previous_counts=excluded.previous_counts,
    anomalies=excluded.anomalies,
    status=excluded.status
  returning * into saved;

  if jsonb_array_length(anomaly_list)>0 then
    risk_id:=private.upsert_risk_case(
      'security','critical_data_count_drop','security.critical_data_count_drop','1.0','p1',
      'CRM 核心数据数量异常下降',
      '每日数量快照发现一个或多个核心数据表下降超过 20% 或归零，请先冻结删除类操作并核对审计与备份。',
      jsonb_build_object('snapshot_date',today,'anomalies',anomaly_list),
      null,null,null,'daily_data_health_snapshot',null
    );
  end if;

  return jsonb_build_object('snapshot_date',saved.snapshot_date,'status',saved.status,
    'counts',saved.counts,'anomalies',saved.anomalies,'risk_case_id',risk_id);
end $$;

revoke all on function private.capture_crm_data_health_snapshot() from public,anon,authenticated;
grant execute on function private.capture_crm_data_health_snapshot() to service_role;

create extension if not exists pg_cron with schema extensions;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='capture-crm-data-health-daily';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  -- pg_cron uses UTC; 16:15 UTC is 00:15 in Asia/Shanghai.
  perform cron.schedule('capture-crm-data-health-daily','15 16 * * *','select private.capture_crm_data_health_snapshot()');
end $$;

select private.capture_crm_data_health_snapshot();

insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
values(
  'c43bd3c2-6e3a-4228-99c7-dc95f33643f2','profile','c43bd3c2-6e3a-4228-99c7-dc95f33643f2',
  'daily_data_health_monitor_enabled',
  jsonb_build_object('schedule','00:15 Asia/Shanghai','threshold','20_percent_or_zero','risk_severity','p1'),
  '项目负责人要求增加每日核心数据数量快照及异常下降报警'
);

commit;
