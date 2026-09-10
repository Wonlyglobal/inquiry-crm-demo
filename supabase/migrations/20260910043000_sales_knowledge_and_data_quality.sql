-- Searchable sales knowledge and persisted data-quality reminders.

create table if not exists public.sales_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('product','certification','faq','quotation','case')),
  title text not null check (length(trim(title)) between 2 and 160),
  summary text,
  content text not null check (length(trim(content)) between 2 and 12000),
  tags text[] not null default '{}',
  language text not null default 'zh-CN',
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,''))
  ) stored
);

create index if not exists sales_knowledge_search_idx on public.sales_knowledge_articles using gin(search_document);
create index if not exists sales_knowledge_active_category_idx on public.sales_knowledge_articles(category,updated_at desc) where active=true;

create table if not exists public.data_quality_alerts (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  alert_key text not null check (alert_key in ('missing_email','missing_country','missing_product','missing_quantity','missing_budget','missing_decision_maker','missing_next_followup','stagnant')),
  severity text not null check (severity in ('warning','high')),
  message text not null,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(inquiry_id,alert_key)
);

create index if not exists data_quality_owner_open_idx on public.data_quality_alerts(owner_id,severity,updated_at desc) where resolved_at is null;

alter table public.sales_knowledge_articles enable row level security;
alter table public.data_quality_alerts enable row level security;

drop policy if exists sales_knowledge_read on public.sales_knowledge_articles;
create policy sales_knowledge_read on public.sales_knowledge_articles for select to authenticated
using (active and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active=true));

drop policy if exists sales_knowledge_manage_insert on public.sales_knowledge_articles;
create policy sales_knowledge_manage_insert on public.sales_knowledge_articles for insert to authenticated
with check (created_by=(select auth.uid()) and private.current_crm_role() in ('owner','sales_manager','marketing'));

drop policy if exists sales_knowledge_manage_update on public.sales_knowledge_articles;
create policy sales_knowledge_manage_update on public.sales_knowledge_articles for update to authenticated
using (private.current_crm_role() in ('owner','sales_manager','marketing'))
with check (private.current_crm_role() in ('owner','sales_manager','marketing'));

drop policy if exists data_quality_read on public.data_quality_alerts;
create policy data_quality_read on public.data_quality_alerts for select to authenticated
using (
  owner_id=(select auth.uid())
  or private.current_crm_role() in ('owner','sales_manager')
);

create or replace function private.sales_knowledge_before_update()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.created_by is distinct from old.created_by then raise exception '不能变更创建人'; end if;
  new.updated_at=clock_timestamp();
  return new;
end;
$$;
revoke all on function private.sales_knowledge_before_update() from public,anon,authenticated;
drop trigger if exists sales_knowledge_before_update on public.sales_knowledge_articles;
create trigger sales_knowledge_before_update before update on public.sales_knowledge_articles for each row execute function private.sales_knowledge_before_update();

create or replace function private.audit_sales_knowledge_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(
    auth.uid(),'sales_knowledge',coalesce(new.id,old.id),lower(tg_op),
    case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end,
    case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end,
    '销售知识库内容变更'
  );
  return new;
end;
$$;
revoke all on function private.audit_sales_knowledge_change() from public,anon,authenticated;
drop trigger if exists sales_knowledge_audit on public.sales_knowledge_articles;
create trigger sales_knowledge_audit after insert or update on public.sales_knowledge_articles for each row execute function private.audit_sales_knowledge_change();

create or replace function public.refresh_my_data_quality_alerts()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := auth.uid();
  refreshed integer := 0;
begin
  if actor_id is null or not exists(select 1 from public.profiles p where p.id=actor_id and p.active=true) then
    raise exception '当前账号无权刷新数据质量提醒';
  end if;

  update public.data_quality_alerts a
  set resolved_at=clock_timestamp(),updated_at=clock_timestamp()
  where a.owner_id=actor_id and a.resolved_at is null;

  insert into public.data_quality_alerts(inquiry_id,owner_id,alert_key,severity,message,detected_at,updated_at,resolved_at)
  select i.id,actor_id,v.alert_key,v.severity,v.message,clock_timestamp(),clock_timestamp(),null
  from public.inquiries i
  cross join lateral (
    values
      ('missing_email', case when not exists(select 1 from public.contacts c where c.company_id=i.company_id and nullif(trim(c.email),'') is not null) then 'high' else null end, '缺少可联系的客户邮箱'),
      ('missing_country', case when nullif(trim(i.target_country),'') is null then 'warning' else null end, '缺少客户国家/地区'),
      ('missing_product', case when nullif(trim(i.product_category),'') is null then 'warning' else null end, '缺少客户关注的产品品类'),
      ('missing_quantity', case when nullif(trim(i.quantity),'') is null then 'warning' else null end, '缺少预计采购数量'),
      ('missing_budget', case when i.estimated_amount is null or i.estimated_amount<=0 then 'warning' else null end, '缺少预算或预计金额'),
      ('missing_decision_maker', case when nullif(trim(i.contact_job_title),'') is null then 'warning' else null end, '尚未识别决策人或联系人职务'),
      ('missing_next_followup', case when i.next_follow_up_at is null then 'high' else null end, '尚未安排下次跟进时间'),
      ('stagnant', case when coalesce(i.updated_at,i.created_at)<clock_timestamp()-interval '14 days' then 'high' else null end, '商机超过 14 天没有更新')
  ) as v(alert_key,severity,message)
  where i.owner_id=actor_id
    and i.validity='valid'
    and i.status not in ('won','lost')
    and coalesce(i.excluded_from_dashboard,false)=false
    and v.severity is not null
  on conflict(inquiry_id,alert_key) do update set
    owner_id=excluded.owner_id,severity=excluded.severity,message=excluded.message,
    detected_at=case when public.data_quality_alerts.resolved_at is null then public.data_quality_alerts.detected_at else excluded.detected_at end,
    updated_at=excluded.updated_at,resolved_at=null;

  get diagnostics refreshed=row_count;
  return refreshed;
end;
$$;

revoke all on function public.refresh_my_data_quality_alerts() from public,anon;
grant execute on function public.refresh_my_data_quality_alerts() to authenticated;
revoke all on public.sales_knowledge_articles,public.data_quality_alerts from anon;
grant select,insert,update on public.sales_knowledge_articles to authenticated;
grant select on public.data_quality_alerts to authenticated;
grant select,insert,update,delete on public.sales_knowledge_articles,public.data_quality_alerts to service_role;
