begin;

do $$
declare
  candidate record;
  inbound_id uuid;
  outbound_id uuid;
begin
  select i.id as inquiry_id,i.owner_id,wc.id as connection_id
  into candidate
  from public.inquiries i
  cross join lateral (
    select id from public.whatsapp_connections where status='connected' order by updated_at desc limit 1
  ) wc
  where i.validity='valid' and i.invalid_review_status is distinct from 'pending'
    and i.owner_id is not null and i.status not in ('won','lost')
  order by i.created_at desc limit 1;
  if candidate.inquiry_id is null then raise exception 'NO_WHATSAPP_REPLY_TEST_CANDIDATE'; end if;

  insert into public.whatsapp_messages(
    connection_id,external_message_id,direction,sender_phone,message_type,body_text,
    inquiry_id,association_status,association_method,delivery_status,occurred_at
  ) values(
    candidate.connection_id,'codex-wa-in-'||gen_random_uuid()::text,'inbound','+12025550124',
    'text','rollback-only WhatsApp inbound reply',candidate.inquiry_id,'matched',
    'rollback_reply_test','received',clock_timestamp()
  ) returning id into inbound_id;

  if not exists(
    select 1 from public.whatsapp_reply_reminders r where r.inbound_message_id=inbound_id
      and r.inquiry_id=candidate.inquiry_id and r.owner_id=candidate.owner_id and r.status='open'
  ) then raise exception 'WHATSAPP_REPLY_REMINDER_NOT_OPENED'; end if;

  insert into public.whatsapp_messages(
    connection_id,external_message_id,direction,recipient_phone,message_type,body_text,
    inquiry_id,association_status,association_method,delivery_status,occurred_at,sent_by
  ) values(
    candidate.connection_id,'codex-wa-out-'||gen_random_uuid()::text,'outbound','+1 (202) 555-0124',
    'text','rollback-only WhatsApp outbound reply',candidate.inquiry_id,'matched',
    'rollback_reply_test','sent',clock_timestamp(),candidate.owner_id
  ) returning id into outbound_id;

  if not exists(
    select 1 from public.whatsapp_reply_reminders r where r.inbound_message_id=inbound_id
      and r.status='replied' and r.replied_message_id=outbound_id and r.replied_at is not null
  ) then raise exception 'WHATSAPP_REPLY_REMINDER_NOT_CLOSED'; end if;
end;
$$;

rollback;

select concat(
  'table=',to_regclass('public.whatsapp_reply_reminders') is not null,
  '; trigger=',exists(select 1 from pg_trigger where tgname='sync_whatsapp_reply_reminder_on_message' and not tgisinternal),
  '; anon_select=',has_table_privilege('anon','public.whatsapp_reply_reminders','select'),
  '; authenticated_select=',has_table_privilege('authenticated','public.whatsapp_reply_reminders','select'),
  '; rollback_messages=',(select count(*) from public.whatsapp_messages where association_method='rollback_reply_test'),
  '; rollback_reminders=',(select count(*) from public.whatsapp_reply_reminders r join public.whatsapp_messages m on m.id=r.inbound_message_id where m.association_method='rollback_reply_test')
) as production_whatsapp_reply_reminders;
