-- Production-safe proof for private, server-validated personal dashboard preferences.
-- Run as a privileged database operator. Every write is rolled back.
begin;

do $$
declare
  test_actor uuid;
  saved public.dashboard_preferences;
  invalid_rejected boolean := false;
begin
  select p.id into test_actor from public.profiles p
  where p.active=true and p.role in ('owner','sales_manager','marketing','sales')
  order by p.created_at limit 1;
  if test_actor is null then raise exception 'NO_DASHBOARD_TEST_ACTOR'; end if;

  perform set_config('request.jwt.claim.sub',test_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select * into saved from public.save_dashboard_preferences(
    array['sales-overview','core-kpis','trends'],array['trends'],'core-kpis'
  );
  if saved.user_id is distinct from test_actor or saved.core_tab<>'core-kpis'
    or not exists(select 1 from public.dashboard_preferences p where p.user_id=test_actor and p.widget_order[1]='sales-overview')
  then raise exception 'DASHBOARD_PREFERENCES_NOT_SAVED'; end if;
  if not exists(select 1 from public.audit_logs a where a.actor_id=test_actor and a.action='dashboard_preferences_updated')
  then raise exception 'DASHBOARD_PREFERENCES_AUDIT_NOT_RECORDED'; end if;

  begin
    perform public.save_dashboard_preferences(array['trends','trends'],array[]::text[],'sales-overview');
  exception when others then
    invalid_rejected := sqlerrm like '%看板模块顺序无效%';
  end;
  if not invalid_rejected then raise exception 'INVALID_DASHBOARD_ORDER_ACCEPTED'; end if;
end;
$$;

rollback;

select concat(
  'table=',to_regclass('public.dashboard_preferences') is not null,
  '; function=',to_regprocedure('public.save_dashboard_preferences(text[],text[],text)') is not null,
  '; anon_execute=',has_function_privilege('anon','public.save_dashboard_preferences(text[],text[],text)','execute'),
  '; authenticated_execute=',has_function_privilege('authenticated','public.save_dashboard_preferences(text[],text[],text)','execute'),
  '; authenticated_insert=',has_table_privilege('authenticated','public.dashboard_preferences','insert'),
  '; authenticated_update=',has_table_privilege('authenticated','public.dashboard_preferences','update')
) as production_dashboard_preferences;
