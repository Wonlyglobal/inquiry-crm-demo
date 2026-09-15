-- Production-safe proof for authorized, durable email read receipts.
-- Run the whole file as a privileged database operator. Every write is rolled back.
begin;

do $$
declare
  target_message uuid;
  test_actor_id uuid;
  marked_at timestamptz;
begin
  select m.id,mc.user_id into target_message,test_actor_id
  from public.email_messages m
  join public.mailbox_connections mc on mc.id=m.mailbox_connection_id
  join public.profiles p on p.id=mc.user_id and p.active=true
  where m.direction='inbound' and p.role in ('owner','sales_manager','marketing','sales')
  order by coalesce(m.received_at,m.created_at) desc limit 1;
  if target_message is null or test_actor_id is null then raise exception 'NO_EMAIL_READ_TEST_FIXTURE'; end if;

  delete from public.email_message_reads
  where email_message_id=target_message and user_id=test_actor_id;
  perform set_config('request.jwt.claim.sub',test_actor_id::text,true);
  select public.mark_email_message_read(target_message) into marked_at;

  if marked_at is null or not exists(
    select 1 from public.email_message_reads
    where email_message_id=target_message and user_id=test_actor_id and read_at=marked_at
  ) then raise exception 'EMAIL_READ_RECEIPT_NOT_RECORDED'; end if;
  if not exists(
    select 1 from public.audit_logs a
    where a.actor_id=test_actor_id and a.entity_id=target_message and a.action='email_message_read'
      and a.reason='用户首次在 CRM 打开并阅读邮件'
  ) then raise exception 'EMAIL_READ_AUDIT_NOT_RECORDED'; end if;
end;
$$;

rollback;

select concat(
  'function=',to_regprocedure('public.mark_email_message_read(uuid)') is not null,
  '; anon_execute=',has_function_privilege('anon','public.mark_email_message_read(uuid)','execute'),
  '; authenticated_execute=',has_function_privilege('authenticated','public.mark_email_message_read(uuid)','execute'),
  '; authenticated_insert=',has_table_privilege('authenticated','public.email_message_reads','insert'),
  '; authenticated_update=',has_table_privilege('authenticated','public.email_message_reads','update'),
  '; rollback_audits=',(select count(*) from public.audit_logs where reason='用户首次在 CRM 打开并阅读邮件' and created_at>clock_timestamp()-interval '2 minutes')
) as production_email_read_receipts;
