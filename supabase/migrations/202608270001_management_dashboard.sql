-- Apply this migration to the linked Supabase project before recording new
-- dashboard timing, channel-cost and target data.
alter table public.inquiries
  add column if not exists assigned_at timestamptz,
  add column if not exists first_valid_contact_at timestamptz,
  add column if not exists quoted_at timestamptz,
  add column if not exists expected_close_date date,
  add column if not exists probability integer check (probability between 0 and 100),
  add column if not exists deal_type text not null default 'first_order' check (deal_type in ('first_order','repeat_order')),
  add column if not exists primary_source text,
  add column if not exists excluded_from_dashboard boolean not null default false,
  add column if not exists dashboard_exclusion_reason text;

create table if not exists public.channel_costs (
  id uuid primary key default gen_random_uuid(), month date not null,
  channel text not null, amount numeric(18,2) not null check (amount >= 0),
  currency text not null default 'CNY', amount_cny numeric(18,2),
  entered_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  unique (month, channel)
);
create table if not exists public.sales_targets (
  id uuid primary key default gen_random_uuid(), target_scope text not null check (target_scope in ('company','team','member')),
  target_key text not null, period_start date not null, period_end date not null,
  metric text not null check (metric in ('inquiries','response_rate','won_amount','conversion_rate')),
  target_value numeric(18,4) not null check (target_value >= 0), currency text,
  entered_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  unique (target_scope,target_key,period_start,period_end,metric)
);
alter table public.channel_costs enable row level security;
alter table public.sales_targets enable row level security;
create policy channel_costs_read on public.channel_costs for select to authenticated using (true);
create policy channel_costs_write on public.channel_costs for all to authenticated using (private.current_crm_role() in ('owner','marketing')) with check (private.current_crm_role() in ('owner','marketing'));
create policy sales_targets_read on public.sales_targets for select to authenticated using (true);
create policy sales_targets_write on public.sales_targets for all to authenticated using (private.current_crm_role() in ('owner','sales_manager')) with check (private.current_crm_role() in ('owner','sales_manager'));
grant select,insert,update on public.channel_costs to authenticated;
grant select,insert,update on public.sales_targets to authenticated;

create or replace function private.record_assignment_time() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then new.assigned_at:=clock_timestamp(); end if;
  if new.status='quoted' and old.status is distinct from new.status and new.quoted_at is null then new.quoted_at:=clock_timestamp(); end if;
  return new;
end; $$;
revoke all on function private.record_assignment_time() from public;
drop trigger if exists inquiries_record_dashboard_times on public.inquiries;
create trigger inquiries_record_dashboard_times before update on public.inquiries for each row execute function private.record_assignment_time();
