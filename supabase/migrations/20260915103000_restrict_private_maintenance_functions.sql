-- Internal trigger and scheduler functions must not be callable by browser roles.
-- PostgreSQL triggers and pg_cron continue to invoke these as their owning role.

revoke all on function private.enforce_inquiry_update_scope()
  from public, anon, authenticated;
revoke all on function private.sync_email_reply_reminder()
  from public, anon, authenticated;
revoke all on function private.sync_email_reply_reminder_owner()
  from public, anon, authenticated;
revoke all on function private.notify_overdue_email_replies()
  from public, anon, authenticated;

grant execute on function private.notify_overdue_email_replies()
  to service_role;
