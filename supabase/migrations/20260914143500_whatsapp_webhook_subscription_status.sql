alter table public.whatsapp_connections
  add column if not exists webhook_verified_at timestamptz;

notify pgrst, 'reload schema';
