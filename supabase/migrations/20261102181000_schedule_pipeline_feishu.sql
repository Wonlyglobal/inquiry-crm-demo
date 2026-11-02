-- Install only after the disabled worker has been deployed and verified.
begin;
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='mail_sync_worker_token') or not exists(select 1 from vault.decrypted_secrets where name='mail_sync_public_api_key') then raise exception '原调度凭据缺失';end if;
 if exists(select 1 from cron.job where jobname='crm-pipeline-feishu-dispatch') then raise exception '流水线调度已存在，请核对版本';end if;
 perform cron.schedule('crm-pipeline-feishu-dispatch','* * * * *',$job$
 select net.http_post(url:='https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/pipeline-feishu-dispatch',headers:=jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='mail_sync_public_api_key' limit 1),'x-mail-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='mail_sync_worker_token' limit 1)),body:='{}'::jsonb,timeout_milliseconds:=110000);
 $job$);
end $$;
commit;
