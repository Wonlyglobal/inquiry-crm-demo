-- Persist personal dashboard layout behind an authenticated, server-validated workflow.

create table if not exists public.dashboard_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  widget_order text[] not null default '{}',
  collapsed_widgets text[] not null default '{}',
  core_tab text not null default 'sales-overview',
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references public.profiles(id)
);

alter table public.dashboard_preferences enable row level security;
drop policy if exists dashboard_preferences_own_select on public.dashboard_preferences;
create policy dashboard_preferences_own_select on public.dashboard_preferences for select to authenticated
  using(user_id=(select auth.uid()));

revoke all on public.dashboard_preferences from anon,authenticated;
grant select on public.dashboard_preferences to authenticated;
grant all on public.dashboard_preferences to service_role;

create or replace function public.save_dashboard_preferences(
  requested_widget_order text[],
  requested_collapsed_widgets text[],
  requested_core_tab text
) returns public.dashboard_preferences
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.crm_role;
  allowed_widgets constant text[] := array[
    'sales-tasks','manager-tasks','legacy-overview','sales-overview','core-kpis',
    'trends','leaderboards','pipeline-risk','channels-followups','outcomes',
    'annual-plan','target-progress','latest-inquiries'
  ];
  allowed_collapsible constant text[] := array['trends','outcomes','annual-plan','latest-inquiries'];
  normalized_core_tab text := coalesce(nullif(btrim(requested_core_tab),''),'sales-overview');
  saved public.dashboard_preferences;
begin
  select p.role into actor_role from public.profiles p where p.id=actor_id and p.active=true;
  if actor_id is null or actor_role not in ('owner','sales_manager','marketing','sales') then
    raise exception '当前账号无权保存看板配置';
  end if;
  if coalesce(cardinality(requested_widget_order),0)>cardinality(allowed_widgets)
    or exists(select 1 from unnest(coalesce(requested_widget_order,'{}'::text[])) as items(item) where not(item=any(allowed_widgets)))
    or (select count(*) from unnest(coalesce(requested_widget_order,'{}'::text[])) as items(item))
       <> (select count(distinct item) from unnest(coalesce(requested_widget_order,'{}'::text[])) as items(item))
  then raise exception '看板模块顺序无效'; end if;
  if coalesce(cardinality(requested_collapsed_widgets),0)>cardinality(allowed_collapsible)
    or exists(select 1 from unnest(coalesce(requested_collapsed_widgets,'{}'::text[])) as items(item) where not(item=any(allowed_collapsible)))
    or (select count(*) from unnest(coalesce(requested_collapsed_widgets,'{}'::text[])) as items(item))
       <> (select count(distinct item) from unnest(coalesce(requested_collapsed_widgets,'{}'::text[])) as items(item))
  then raise exception '看板收起状态无效'; end if;
  if normalized_core_tab not in ('sales-overview','core-kpis','leaderboards','pipeline-risk') then
    raise exception '核心指标页签无效';
  end if;
  if actor_role='sales' and normalized_core_tab='leaderboards' then normalized_core_tab := 'sales-overview'; end if;

  insert into public.dashboard_preferences(user_id,widget_order,collapsed_widgets,core_tab,updated_at,updated_by)
  values(actor_id,coalesce(requested_widget_order,'{}'::text[]),coalesce(requested_collapsed_widgets,'{}'::text[]),normalized_core_tab,clock_timestamp(),actor_id)
  on conflict(user_id) do update set
    widget_order=excluded.widget_order,collapsed_widgets=excluded.collapsed_widgets,
    core_tab=excluded.core_tab,updated_at=excluded.updated_at,updated_by=excluded.updated_by
  returning * into saved;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor_id,'profile',actor_id,'dashboard_preferences_updated',
    jsonb_build_object('widget_order',saved.widget_order,'collapsed_widgets',saved.collapsed_widgets,'core_tab',saved.core_tab),
    '本人更新个人看板布局');
  return saved;
end;
$$;

revoke all on function public.save_dashboard_preferences(text[],text[],text) from public,anon;
grant execute on function public.save_dashboard_preferences(text[],text[],text) to authenticated;
grant execute on function public.save_dashboard_preferences(text[],text[],text) to service_role;
