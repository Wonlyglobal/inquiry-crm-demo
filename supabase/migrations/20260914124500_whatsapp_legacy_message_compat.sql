-- Bring the pre-existing WhatsApp tables up to the Cloud API contract used by
-- the sender, webhook worker and CRM message views.
update public.whatsapp_connections
set created_by = coalesce(created_by, owner_id),
    updated_by = coalesce(updated_by, owner_id),
    display_phone_number = coalesce(display_phone_number, display_phone)
where created_by is null
   or updated_by is null
   or display_phone_number is null;

alter table public.whatsapp_messages
  add column if not exists external_message_id text,
  add column if not exists sender_phone text,
  add column if not exists recipient_phone text,
  add column if not exists message_type text not null default 'text',
  add column if not exists body_text text,
  add column if not exists media_id text,
  add column if not exists media_mime_type text,
  add column if not exists media_sha256 text,
  add column if not exists association_status text not null default 'pending',
  add column if not exists association_method text,
  add column if not exists delivery_status text not null default 'received',
  add column if not exists occurred_at timestamptz not null default clock_timestamp(),
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

drop index if exists public.whatsapp_messages_external_id_idx;
create unique index whatsapp_messages_external_id_idx
  on public.whatsapp_messages(connection_id, external_message_id);

create index if not exists whatsapp_messages_inquiry_time_idx
  on public.whatsapp_messages(inquiry_id, occurred_at desc);

create index if not exists whatsapp_messages_phone_time_idx
  on public.whatsapp_messages(sender_phone, occurred_at desc);

grant select, insert, update on table public.whatsapp_messages to service_role;

notify pgrst, 'reload schema';
