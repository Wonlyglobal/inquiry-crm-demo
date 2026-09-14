-- The legacy whatsapp_connections table did not retain the DML grants expected
-- by the server-side WhatsApp connection administrator.
grant select, insert, update on table public.whatsapp_connections to service_role;

notify pgrst, 'reload schema';
