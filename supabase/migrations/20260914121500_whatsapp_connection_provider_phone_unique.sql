-- Restore the conflict target expected by the WhatsApp connection upsert when
-- whatsapp_connections predates the Cloud API schema migration.
create unique index if not exists whatsapp_connections_provider_phone_number_uidx
  on public.whatsapp_connections(provider, phone_number_id);

notify pgrst, 'reload schema';
