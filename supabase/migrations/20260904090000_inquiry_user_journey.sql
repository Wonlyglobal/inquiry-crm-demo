-- Privacy-safe website inquiry journey. Never stores form field values or direct contact details.

create table if not exists public.inquiry_user_journey_events (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  session_ref text,
  event_name text not null,
  event_at timestamptz,
  sequence_no integer not null,
  page_path text,
  page_title text,
  cta_name text,
  section_name text,
  language text,
  product_context text,
  error_type text,
  created_at timestamptz not null default clock_timestamp(),
  constraint inquiry_journey_event_name_check check (event_name in ('cta_click','form_open','form_start','form_submit','generate_lead','form_error','form_abandon','contact_click')),
  constraint inquiry_journey_sequence_check check (sequence_no between 1 and 100)
);

create unique index if not exists inquiry_user_journey_event_unique_idx
  on public.inquiry_user_journey_events(inquiry_id,sequence_no);
create index if not exists inquiry_user_journey_event_timeline_idx
  on public.inquiry_user_journey_events(inquiry_id,event_at,sequence_no);

alter table public.inquiry_user_journey_events enable row level security;
drop policy if exists inquiry_user_journey_events_read_scope on public.inquiry_user_journey_events;
create policy inquiry_user_journey_events_read_scope on public.inquiry_user_journey_events for select to authenticated
using (exists(select 1 from public.inquiries i where i.id=inquiry_id and (private.current_crm_role() in ('owner','sales_manager','marketing') or i.owner_id=auth.uid())));

grant select on public.inquiry_user_journey_events to authenticated;
grant select,insert on public.inquiry_user_journey_events to service_role;
