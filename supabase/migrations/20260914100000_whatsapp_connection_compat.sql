-- Keep the WhatsApp connection schema compatible with the deployed CRM UI.
alter table public.whatsapp_connections
  add column if not exists provider text not null default '官方 Cloud API / BSP',
  add column if not exists display_phone_number text,
  add column if not exists last_received_at timestamptz,
  add column if not exists last_sent_at timestamptz;

update public.whatsapp_connections
set display_phone_number = coalesce(display_phone_number, display_phone)
where display_phone_number is null;
