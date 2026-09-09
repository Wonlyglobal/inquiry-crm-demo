create table if not exists public.quotation_versions (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  subject text not null,
  currency text not null default 'USD',
  total_amount numeric(18,2) not null default 0 check (total_amount >= 0),
  trade_terms text,
  validity_until date,
  notes text,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected','sent')),
  created_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(inquiry_id,version_no)
);

alter table public.quotation_versions enable row level security;
drop policy if exists quotation_versions_read on public.quotation_versions;
create policy quotation_versions_read on public.quotation_versions for select to authenticated
using (exists(select 1 from public.inquiries i where i.id=inquiry_id));
drop policy if exists quotation_versions_insert on public.quotation_versions;
create policy quotation_versions_insert on public.quotation_versions for insert to authenticated
with check (created_by=auth.uid() and exists(select 1 from public.inquiries i where i.id=inquiry_id and (i.owner_id=auth.uid() or private.current_crm_role() in ('owner','sales_manager'))));
drop policy if exists quotation_versions_update on public.quotation_versions;
create policy quotation_versions_update on public.quotation_versions for update to authenticated
using (created_by=auth.uid() or private.current_crm_role() in ('owner','sales_manager'))
with check (created_by=auth.uid() or private.current_crm_role() in ('owner','sales_manager'));
grant select,insert,update on public.quotation_versions to authenticated;
grant all on public.quotation_versions to service_role;

create or replace function public.create_quotation_version(target_inquiry_id uuid,quote_subject text,quote_currency text,quote_total numeric,quote_terms text default null,quote_valid_until date default null,quote_notes text default null)
returns public.quotation_versions language plpgsql security invoker set search_path=public as $$
declare next_version integer; saved public.quotation_versions;
begin
  if not exists(select 1 from public.inquiries where id=target_inquiry_id and (owner_id=auth.uid() or (select role from public.profiles where id=auth.uid()) in ('owner','sales_manager'))) then raise exception '只能为本人负责或有权管理的询盘创建报价'; end if;
  select coalesce(max(version_no),0)+1 into next_version from public.quotation_versions where inquiry_id=target_inquiry_id;
  insert into public.quotation_versions(inquiry_id,version_no,subject,currency,total_amount,trade_terms,validity_until,notes,created_by)
  values(target_inquiry_id,next_version,trim(quote_subject),upper(trim(quote_currency)),quote_total,nullif(trim(quote_terms),''),quote_valid_until,nullif(trim(quote_notes),''),auth.uid()) returning * into saved;
  return saved;
end $$;
grant execute on function public.create_quotation_version(uuid,text,text,numeric,text,date,text) to authenticated;
