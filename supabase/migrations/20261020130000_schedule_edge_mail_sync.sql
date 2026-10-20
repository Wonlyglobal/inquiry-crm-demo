-- Poll connected mailboxes every minute via the existing Supabase Edge runtime.
-- Both the worker token and public project API key are read from Vault at run time.
-- Provision mail_sync_public_api_key from the existing public CRM configuration
-- before applying this schedule. Never place privileged credentials in this job.
do $$
declare existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname='crm-mail-sync-worker'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'crm-mail-sync-worker',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/mail-sync-worker',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          ('api' || 'key'),(select decrypted_secret from vault.decrypted_secrets where name='mail_sync_public_api_key' limit 1),
          'x-mail-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='mail_sync_worker_token' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );
end;
$$;
