-- WhatsApp Business Cloud API/BSP channel groundwork.
-- Personal WhatsApp accounts are intentionally not supported: credentials and
-- session cookies must never be stored in CRM. Provider access tokens stay in
-- Supabase secrets and are only used by a server-side integration worker.

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta_cloud','official_bsp')),
  business_account_id text,
  phone_number_id text not null,
  display_phone_number text,
  display_name text,
  status text not null default 'pending' check (status in ('pending','connected','error','disabled')),
  webhook_verified_at timestamptz,
  last_received_at timestamptz,
  last_sent_at timestamptz,
  last_error text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(provider, phone_number_id)
);

create index if not exists whatsapp_connections_status_idx
  on public.whatsapp_connections(status, updated_at desc);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  external_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  sender_phone text,
  recipient_phone text,
  message_type text not null default 'text',
  body_text text,
  media_id text,
  media_mime_type text,
  media_sha256 text,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  delivery_status text not null default 'received' check (delivery_status in ('received','queued','sent','delivered','read','failed')),
  occurred_at timestamptz not null default clock_timestamp(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create unique index if not exists whatsapp_messages_external_id_idx
  on public.whatsapp_messages(connection_id, external_message_id)
  where external_message_id is not null;
create index if not exists whatsapp_messages_inquiry_time_idx
  on public.whatsapp_messages(inquiry_id, occurred_at desc);
create index if not exists whatsapp_messages_phone_time_idx
  on public.whatsapp_messages(sender_phone, occurred_at desc);

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy whatsapp_connections_read_managed on public.whatsapp_connections
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or private.current_crm_role() in ('owner','sales_manager')
  );

create policy whatsapp_connections_manage_admin on public.whatsapp_connections
  for all to authenticated
  using (private.current_crm_role() in ('owner','sales_manager'))
  with check (private.current_crm_role() in ('owner','sales_manager'));

create policy whatsapp_messages_read_visible on public.whatsapp_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.whatsapp_connections c
      where c.id = connection_id
        and (c.created_by = (select auth.uid()) or private.current_crm_role() in ('owner','sales_manager'))
    )
    and (
      inquiry_id is null
      or exists (select 1 from public.inquiries i where i.id = inquiry_id)
    )
  );

grant select on public.whatsapp_connections, public.whatsapp_messages to authenticated;
grant all on public.whatsapp_connections, public.whatsapp_messages to service_role;

alter table public.whatsapp_messages replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.whatsapp_messages;
exception when duplicate_object then null;
end $$;
