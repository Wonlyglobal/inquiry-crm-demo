-- Explicit per-account export still requires the server grant; read-only business mutations remain denied.
begin;
grant execute on function public.company_export_workspace(text,jsonb) to crm_marketing_readonly;
grant execute on function public.get_inquiry_channel_origins(uuid[]) to crm_marketing_readonly;
commit;
