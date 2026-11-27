-- Install after the authenticated history worker is deployed. Existing mail
-- sync and its Vault credentials remain unchanged. No secret leaves Vault.
do $$
begin
 if not exists(select 1 from cron.job where jobname='crm-inquiry-mail-history-worker') then
 perform cron.schedule('crm-inquiry-mail-history-worker','* * * * *',$job$
 select net.http_post(
  url:='https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/inquiry-mail-history',
  headers:=jsonb_build_object('Content-Type','application/json',('api'||'key'),(select decrypted_secret from vault.decrypted_secrets where name='mail_sync_public_api_key' limit 1),'x-mail-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='mail_sync_worker_token' limit 1)),
  body:='{"action":"worker_tick"}'::jsonb,timeout_milliseconds:=120000);
 $job$);
 end if;
end $$;
