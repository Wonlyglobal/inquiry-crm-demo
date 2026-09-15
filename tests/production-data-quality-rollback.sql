-- Production-safe acceptance test for automatic inquiry data-quality alerts.
-- Run the whole file as a privileged database operator. Every write is rolled back.
begin;

do $$
declare
  target_inquiry uuid;
begin
  select id into target_inquiry
  from public.inquiries
  where title like '[功能测试]%'
    and owner_id is not null
  order by created_at desc
  limit 1;

  if target_inquiry is null then
    raise exception 'NO_FUNCTIONAL_TEST_FIXTURE';
  end if;

  update public.inquiries
  set target_country = null
  where id = target_inquiry;

  if not exists (
    select 1
    from public.data_quality_alerts
    where inquiry_id = target_inquiry
      and alert_key = 'missing_country'
      and resolved_at is null
  ) then
    raise exception 'CREATE_ASSERTION_FAILED';
  end if;

  update public.inquiries
  set target_country = '__QA_ROLLBACK__'
  where id = target_inquiry;

  if not exists (
    select 1
    from public.data_quality_alerts
    where inquiry_id = target_inquiry
      and alert_key = 'missing_country'
      and resolved_at is not null
  ) then
    raise exception 'RESOLVE_ASSERTION_FAILED';
  end if;
end;
$$;

select
  'PASS — trigger created and resolved missing_country; all test writes will be rolled back' as production_regression,
  has_function_privilege('anon', 'private.refresh_all_data_quality_alerts()', 'execute') as anon_can_refresh_all,
  has_function_privilege('authenticated', 'private.refresh_all_data_quality_alerts()', 'execute') as authenticated_can_refresh_all,
  exists (
    select 1
    from cron.job
    where jobname = 'refresh-crm-data-quality-daily'
      and active
  ) as daily_cron_active;

rollback;
