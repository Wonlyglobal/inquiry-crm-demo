-- Run only after isolated acceptance and dispatch deployment. Existing Vault keys,
-- no new credentials, no browser dependency or email sending.
begin;
do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='mail_sync_worker_token') or not exists(select 1 from vault.decrypted_secrets where name='mail_sync_public_api_key') then raise exception '原调度凭据缺失，不启用提醒'; end if;
 if exists(select 1 from cron.job where jobname in('crm-sales-lead-schedule','crm-sales-lead-dispatch')) then raise exception '调度名称已存在，需先核对版本'; end if;
 perform cron.schedule('crm-sales-lead-schedule','* * * * *','select private.process_sales_lead_schedule()');
 perform cron.schedule('crm-sales-lead-dispatch','*/2 * * * *',$job$
 select net.http_post(url:='https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/sales-lead-dispatch',headers:=jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='mail_sync_public_api_key' limit 1),'x-mail-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='mail_sync_worker_token' limit 1)),body:='{}'::jsonb,timeout_milliseconds:=110000);
 $job$);
end $$;
commit;
