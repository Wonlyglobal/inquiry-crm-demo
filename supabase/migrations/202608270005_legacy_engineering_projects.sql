create table if not exists public.legacy_engineering_projects (
  id uuid primary key default gen_random_uuid(),
  legacy_project_id bigint not null unique,
  country text,
  partner_name text,
  partner_province text,
  partner_city text,
  customer_type text,
  project_name text,
  product_type text,
  funnel_bucket text,
  factory_price_amount numeric,
  contract_no text,
  contract_quantity text,
  contract_amount_wan numeric,
  website text,
  project_status text,
  next_milestone_at date,
  project_total_quantity text,
  lead_source text,
  follow_up_status text,
  contact_name text,
  contact_details text,
  contact_title text,
  lost_reason text,
  lost_reason_description text,
  legacy_owner_name text,
  owner_id uuid references public.profiles(id),
  legacy_creator_name text,
  source_created_at timestamptz,
  legacy_modifier_name text,
  source_updated_at timestamptz,
  department text,
  source_file text not null,
  raw_data jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now()
);

comment on table public.legacy_engineering_projects is '旧国际工程 CRM 历史项目；独立于询盘转化漏斗，避免污染首次成交和询盘指标。';
comment on column public.legacy_engineering_projects.contract_amount_wan is '原表合同总金额，单位为人民币万元。';
comment on column public.legacy_engineering_projects.funnel_bucket is '原系统分类：碗里、田里、锅里。';

create index if not exists legacy_projects_owner_idx on public.legacy_engineering_projects(owner_id);
create index if not exists legacy_projects_country_idx on public.legacy_engineering_projects(country);
create index if not exists legacy_projects_status_idx on public.legacy_engineering_projects(project_status);
create index if not exists legacy_projects_next_milestone_idx on public.legacy_engineering_projects(next_milestone_at);
create index if not exists legacy_projects_partner_idx on public.legacy_engineering_projects(lower(partner_name));

alter table public.legacy_engineering_projects enable row level security;

create policy legacy_projects_read on public.legacy_engineering_projects for select to authenticated
using (
  private.current_crm_role() in ('owner','sales_manager','marketing')
  or owner_id = (select auth.uid())
);

grant select on public.legacy_engineering_projects to authenticated;
grant select, insert, update on public.legacy_engineering_projects to service_role;

-- Historical rows are imported separately and are never committed to source control.

update public.legacy_engineering_projects p
set owner_id = profile.id
from public.profiles profile
where lower(profile.full_name) = lower(case when p.legacy_owner_name = '石舒' then '石奕舒' else p.legacy_owner_name end);
