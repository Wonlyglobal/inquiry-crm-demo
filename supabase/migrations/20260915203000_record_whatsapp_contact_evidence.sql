-- Turn a successful WhatsApp Cloud API submission into auditable CRM evidence.
alter table public.whatsapp_messages
  add column if not exists sent_by uuid references public.profiles(id) on delete set null;

create index if not exists whatsapp_messages_sent_by_time_idx
  on public.whatsapp_messages(sent_by,occurred_at desc) where sent_by is not null;

alter table public.follow_ups
  add column if not exists whatsapp_message_id uuid references public.whatsapp_messages(id) on delete set null;

create unique index if not exists follow_ups_whatsapp_message_unique
  on public.follow_ups(whatsapp_message_id) where whatsapp_message_id is not null;

create or replace function public.record_sent_whatsapp_followup(target_whatsapp_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  message_row public.whatsapp_messages;
  inquiry_row public.inquiries;
  sender_role public.crm_role;
  followup_id uuid;
  mark_first_contact boolean := false;
begin
  select * into message_row from public.whatsapp_messages where id=target_whatsapp_message_id;
  if not found then raise exception 'WhatsApp 消息不存在'; end if;
  if message_row.direction<>'outbound' or message_row.inquiry_id is null
    or message_row.sent_by is null or message_row.external_message_id is null
    or message_row.delivery_status not in ('queued','sent','delivered','read') then
    raise exception 'WhatsApp 消息尚未形成可验证的发送证据';
  end if;

  select p.role into sender_role from public.profiles p
  where p.id=message_row.sent_by and p.active=true;
  if sender_role not in ('sales','sales_manager','owner') then
    raise exception 'WhatsApp 发送人无权写入客户跟进';
  end if;

  select * into inquiry_row from public.inquiries where id=message_row.inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if sender_role='sales' and inquiry_row.owner_id is distinct from message_row.sent_by then
    raise exception '只能记录本人负责询盘的 WhatsApp 跟进';
  end if;

  mark_first_contact:=inquiry_row.first_valid_contact_at is null
    and inquiry_row.owner_id=message_row.sent_by
    and inquiry_row.assigned_at is not null
    and message_row.occurred_at>=inquiry_row.assigned_at
    and inquiry_row.validity='valid'
    and inquiry_row.invalid_review_status is distinct from 'pending';

  select f.id into followup_id from public.follow_ups f where f.whatsapp_message_id=message_row.id;
  if followup_id is null then
    insert into public.follow_ups(
      inquiry_id,author_id,method,content,source,direction,whatsapp_message_id,
      is_first_valid_contact,is_task,created_at
    ) values(
      inquiry_row.id,message_row.sent_by,'whatsapp',
      coalesce(nullif(trim(message_row.body_text),''),'WhatsApp 消息'),
      'whatsapp_cloud_api','outbound',message_row.id,mark_first_contact,false,message_row.occurred_at
    ) returning id into followup_id;
  end if;

  if mark_first_contact then
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set first_valid_contact_at=message_row.occurred_at,
      updated_by=message_row.sent_by,last_change_reason='WhatsApp Cloud API 发送同步首次有效联系',
      updated_at=clock_timestamp() where id=inquiry_row.id;
    insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
    values(message_row.sent_by,'follow_up',followup_id,'whatsapp_first_valid_contact_recorded',
      jsonb_build_object('inquiry_id',inquiry_row.id,'whatsapp_message_id',message_row.id,'occurred_at',message_row.occurred_at),
      'WhatsApp Cloud API 成功提交并写入首次有效联系');
  end if;

  return jsonb_build_object('followup_id',followup_id,'inquiry_id',inquiry_row.id,
    'first_valid_contact_recorded',mark_first_contact);
end;
$$;

revoke all on function public.record_sent_whatsapp_followup(uuid) from public,anon,authenticated;
grant execute on function public.record_sent_whatsapp_followup(uuid) to service_role;
