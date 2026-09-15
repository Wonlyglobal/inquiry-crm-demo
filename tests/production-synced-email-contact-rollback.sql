begin;

do $$
declare
  candidate record;
  message_id uuid;
  result jsonb;
  duplicate_result jsonb;
begin
  select i.id as inquiry_id,i.owner_id,mc.id as mailbox_connection_id
  into candidate
  from public.inquiries i
  join public.mailbox_connections mc on mc.user_id=i.owner_id
  where i.validity='valid'
    and i.invalid_review_status is distinct from 'pending'
    and i.first_valid_contact_at is null
    and i.status not in ('won','lost')
  order by i.created_at desc
  limit 1;
  if candidate.inquiry_id is null then raise exception 'NO_EMAIL_CONTACT_TEST_CANDIDATE'; end if;

  insert into public.email_messages(
    mailbox_connection_id,folder,uid,direction,sender_email,subject,body_text,
    sent_at,inquiry_id,association_status,association_method
  ) values(
    candidate.mailbox_connection_id,'codex-email-contact-rollback',
    -extract(epoch from clock_timestamp())::bigint,'outbound','rollback-test@wonly.invalid',
    '[ROLLBACK TEST] first contact','rollback-only email contact evidence',
    clock_timestamp(),candidate.inquiry_id,'matched','rollback_test'
  ) returning id into message_id;

  result:=public.record_synced_email_followup(message_id);
  duplicate_result:=public.record_synced_email_followup(message_id);
  if coalesce((result->>'first_valid_contact_recorded')::boolean,false)<>true then
    raise exception 'FIRST_EMAIL_CONTACT_NOT_RECORDED';
  end if;
  if coalesce((duplicate_result->>'first_valid_contact_recorded')::boolean,false)<>false then
    raise exception 'DUPLICATE_EMAIL_CONTACT_RECORDED';
  end if;
  if (select count(*) from public.follow_ups where email_message_id=message_id)<>1 then
    raise exception 'EMAIL_FOLLOWUP_NOT_IDEMPOTENT';
  end if;
  if not exists(
    select 1 from public.inquiries i
    join public.follow_ups f on f.inquiry_id=i.id
    where i.id=candidate.inquiry_id and i.first_valid_contact_at is not null
      and f.email_message_id=message_id and f.is_first_valid_contact=true
      and f.author_id=candidate.owner_id
  ) then raise exception 'EMAIL_CONTACT_EVIDENCE_INCOMPLETE'; end if;
end;
$$;

rollback;

select concat(
  'function=',to_regprocedure('public.record_synced_email_followup(uuid)') is not null,
  '; anon_execute=',has_function_privilege('anon','public.record_synced_email_followup(uuid)','execute'),
  '; authenticated_execute=',has_function_privilege('authenticated','public.record_synced_email_followup(uuid)','execute'),
  '; service_execute=',has_function_privilege('service_role','public.record_synced_email_followup(uuid)','execute'),
  '; rollback_messages=',(select count(*) from public.email_messages where folder='codex-email-contact-rollback'),
  '; rollback_followups=',(select count(*) from public.follow_ups f join public.email_messages e on e.id=f.email_message_id where e.folder='codex-email-contact-rollback')
) as production_email_contact_evidence;
