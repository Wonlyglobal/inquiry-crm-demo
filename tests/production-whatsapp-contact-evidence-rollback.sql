begin;

do $$
declare
  candidate record;
  message_id uuid;
  result jsonb;
  duplicate_result jsonb;
begin
  select i.id as inquiry_id,i.owner_id,wc.id as connection_id
  into candidate
  from public.inquiries i
  cross join lateral (
    select id from public.whatsapp_connections where status='connected' order by updated_at desc limit 1
  ) wc
  where i.validity='valid' and i.invalid_review_status is distinct from 'pending'
    and i.first_valid_contact_at is null and i.status not in ('won','lost')
  order by i.created_at desc limit 1;
  if candidate.inquiry_id is null then raise exception 'NO_WHATSAPP_CONTACT_TEST_CANDIDATE'; end if;

  insert into public.whatsapp_messages(
    connection_id,external_message_id,direction,recipient_phone,message_type,body_text,
    inquiry_id,association_status,association_method,delivery_status,occurred_at,sent_by
  ) values(
    candidate.connection_id,'codex-rollback-'||gen_random_uuid()::text,'outbound','+12025550123',
    'text','rollback-only WhatsApp contact evidence',candidate.inquiry_id,'matched',
    'rollback_test','queued',clock_timestamp(),candidate.owner_id
  ) returning id into message_id;

  result:=public.record_sent_whatsapp_followup(message_id);
  duplicate_result:=public.record_sent_whatsapp_followup(message_id);
  if coalesce((result->>'first_valid_contact_recorded')::boolean,false)<>true then
    raise exception 'FIRST_WHATSAPP_CONTACT_NOT_RECORDED';
  end if;
  if coalesce((duplicate_result->>'first_valid_contact_recorded')::boolean,false)<>false then
    raise exception 'DUPLICATE_WHATSAPP_CONTACT_RECORDED';
  end if;
  if (select count(*) from public.follow_ups where whatsapp_message_id=message_id)<>1 then
    raise exception 'WHATSAPP_FOLLOWUP_NOT_IDEMPOTENT';
  end if;
  if not exists(
    select 1 from public.inquiries i join public.follow_ups f on f.inquiry_id=i.id
    where i.id=candidate.inquiry_id and i.first_valid_contact_at is not null
      and f.whatsapp_message_id=message_id and f.is_first_valid_contact=true
      and f.author_id=candidate.owner_id
  ) then raise exception 'WHATSAPP_CONTACT_EVIDENCE_INCOMPLETE'; end if;
end;
$$;

rollback;

select concat(
  'function=',to_regprocedure('public.record_sent_whatsapp_followup(uuid)') is not null,
  '; anon_execute=',has_function_privilege('anon','public.record_sent_whatsapp_followup(uuid)','execute'),
  '; authenticated_execute=',has_function_privilege('authenticated','public.record_sent_whatsapp_followup(uuid)','execute'),
  '; service_execute=',has_function_privilege('service_role','public.record_sent_whatsapp_followup(uuid)','execute'),
  '; rollback_messages=',(select count(*) from public.whatsapp_messages where association_method='rollback_test'),
  '; rollback_followups=',(select count(*) from public.follow_ups where whatsapp_message_id is not null and content='rollback-only WhatsApp contact evidence')
) as production_whatsapp_contact_evidence;
