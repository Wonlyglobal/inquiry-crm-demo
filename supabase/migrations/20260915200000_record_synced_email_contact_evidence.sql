-- Turn an authoritative synchronized email into auditable CRM communication.
-- Only the mail-sync service may call this function. First-contact KPI state and
-- its follow-up evidence are written under one inquiry row lock/transaction.
create or replace function public.record_synced_email_followup(target_email_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  message_row public.email_messages;
  inquiry_row public.inquiries;
  connection_user_id uuid;
  connection_creator_id uuid;
  actor_id uuid;
  followup_id uuid;
  occurred_at timestamptz;
  mark_first_contact boolean := false;
begin
  select em.* into message_row
  from public.email_messages em
  where em.id=target_email_message_id;

  if not found then raise exception '邮件记录不存在'; end if;
  select mc.user_id,mc.created_by
  into connection_user_id,connection_creator_id
  from public.mailbox_connections mc
  where mc.id=message_row.mailbox_connection_id;
  if message_row.inquiry_id is null or message_row.association_status<>'matched' then
    raise exception '邮件尚未匹配到询盘';
  end if;

  select * into inquiry_row
  from public.inquiries
  where id=message_row.inquiry_id
  for update;
  if not found then raise exception '询盘不存在'; end if;

  actor_id:=coalesce(connection_user_id,inquiry_row.owner_id,connection_creator_id);
  if actor_id is null or not exists(select 1 from public.profiles p where p.id=actor_id) then
    raise exception '无法确定邮件沟通人';
  end if;
  occurred_at:=coalesce(message_row.sent_at,message_row.received_at,message_row.created_at,clock_timestamp());
  mark_first_contact:=message_row.direction='outbound'
    and inquiry_row.first_valid_contact_at is null
    and inquiry_row.owner_id=actor_id
    and inquiry_row.assigned_at is not null
    and occurred_at>=inquiry_row.assigned_at
    and inquiry_row.validity='valid'
    and inquiry_row.invalid_review_status is distinct from 'pending';

  select f.id into followup_id
  from public.follow_ups f
  where f.email_message_id=message_row.id;

  if followup_id is null then
    insert into public.follow_ups(
      inquiry_id,author_id,method,content,customer_feedback,source,direction,
      email_message_id,is_first_valid_contact,is_task,created_at
    ) values(
      inquiry_row.id,actor_id,'email',
      coalesce(nullif(trim(message_row.body_text),''),nullif(trim(message_row.subject),''),'邮件沟通'),
      case when message_row.direction='inbound' then nullif(trim(message_row.body_text),'') else null end,
      'email_sync',message_row.direction,message_row.id,mark_first_contact,false,occurred_at
    ) returning id into followup_id;
  elsif mark_first_contact then
    update public.follow_ups set
      inquiry_id=inquiry_row.id,author_id=actor_id,is_first_valid_contact=true,
      source='email_sync',direction='outbound',created_at=occurred_at
    where id=followup_id;
  end if;

  if mark_first_contact then
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set
      first_valid_contact_at=occurred_at,
      updated_by=actor_id,
      last_change_reason='从已发送邮件同步首次有效联系',
      updated_at=clock_timestamp()
    where id=inquiry_row.id;

    insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
    values(actor_id,'follow_up',followup_id,'email_first_valid_contact_recorded',
      jsonb_build_object('inquiry_id',inquiry_row.id,'email_message_id',message_row.id,'occurred_at',occurred_at),
      '已发送箱真实邮件同步为首次有效联系');
  end if;

  return jsonb_build_object(
    'followup_id',followup_id,
    'inquiry_id',inquiry_row.id,
    'first_valid_contact_recorded',mark_first_contact,
    'occurred_at',occurred_at
  );
end;
$$;

revoke all on function public.record_synced_email_followup(uuid) from public,anon,authenticated;
grant execute on function public.record_synced_email_followup(uuid) to service_role;
