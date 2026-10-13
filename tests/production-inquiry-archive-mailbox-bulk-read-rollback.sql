-- Production acceptance for audited inquiry archive/restore and personal-mailbox bulk read.
-- Run the whole file as a privileged operator after applying the migration; all writes roll back.
begin;

do $$
declare
  owner_id uuid;
  inquiry_id uuid;
  mail_actor_id uuid;
  message_id uuid;
  marked_count integer;
begin
  select p.id into owner_id from public.profiles p
  where p.active=true and p.role='owner' order by p.created_at limit 1;
  select i.id into inquiry_id from public.inquiries i
  where i.is_test_data=true and i.excluded_from_dashboard=true and i.archived_at is null
  order by i.created_at desc limit 1;
  if owner_id is null or inquiry_id is null then raise exception 'NO_SYNTHETIC_INQUIRY_ARCHIVE_FIXTURE'; end if;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform public.archive_inquiry(inquiry_id,'发布验收：合成询盘归档回滚验证');
  if not exists(select 1 from public.list_archived_inquiries() a where a.id=inquiry_id) then
    raise exception 'ARCHIVED_INQUIRY_NOT_LISTED_TO_OWNER';
  end if;
  perform public.restore_inquiry_from_archive(inquiry_id,'发布验收：合成询盘恢复回滚验证');
  if exists(select 1 from public.inquiries where id=inquiry_id and archived_at is not null) then
    raise exception 'INQUIRY_RESTORE_FAILED';
  end if;

  select m.id,mc.user_id into message_id,mail_actor_id
  from public.email_messages m
  join public.mailbox_connections mc on mc.id=m.mailbox_connection_id
  join public.profiles p on p.id=mc.user_id and p.active=true
  where m.direction='inbound' and mc.mailbox_kind='personal'
    and p.role in ('owner','sales_manager','marketing','sales')
    and not exists(select 1 from public.email_message_reads r where r.email_message_id=m.id and r.user_id=mc.user_id)
  order by coalesce(m.received_at,m.created_at) desc limit 1;
  if message_id is null or mail_actor_id is null then raise exception 'NO_UNREAD_PERSONAL_INBOUND_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',mail_actor_id::text,true);
  select public.mark_my_mailbox_messages_read(array[message_id]) into marked_count;
  if marked_count<>1 or not exists(
    select 1 from public.email_message_reads r where r.email_message_id=message_id and r.user_id=mail_actor_id
  ) then raise exception 'MAILBOX_BULK_READ_FAILED'; end if;
end;
$$;

select 'PASS — owner-only inquiry archive/restore and one inbound personal-mailbox CRM read receipt; all acceptance writes roll back' as production_regression;
rollback;
