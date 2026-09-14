-- Backfill audit columns when whatsapp_connections predates the Cloud API schema.
alter table public.whatsapp_connections
  add column if not exists display_name text,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists created_at timestamptz not null default clock_timestamp(),
  add column if not exists updated_at timestamptz not null default clock_timestamp();

create index if not exists whatsapp_connections_created_by_idx
  on public.whatsapp_connections(created_by);

notify pgrst, 'reload schema';
