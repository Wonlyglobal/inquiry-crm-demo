-- Let a salesperson attach one of their synchronized personal-mailbox messages
-- to an inquiry they are allowed to manage. The association and the dated CRM
-- communication evidence are committed atomically; AI summarization remains a
-- separate, retryable Edge Function call after this transaction succeeds.
create or replace function public.associate_personal_email_with_inquiry(
  target_email_message_id uuid,
  target_inquiry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid:=auth.uid();
  actor_role public.crm_role;
  message_row public.email_messages;
  inquiry_row public.inquiries;
  result jsonb;
begin
  if actor_id is null then raise exception '请先登录'; end if;

  select p.role into actor_role
  from public.profiles p
  where p.id=actor_id and p.active=true;
  if actor_role not in ('owner','sales_manager','sales') then
    raise exception '当前角色不能关联销售询盘邮件';
  end if;

  select em.* into message_row
  from public.email_messages em
  join public.mailbox_connections mc on mc.id=em.mailbox_connection_id
  where em.id=target_email_message_id
    and mc.user_id=actor_id
    and mc.mailbox_kind='personal'
  for update of em;
  if not found then raise exception '邮件不存在或不属于当前账号的个人邮箱'; end if;
  if message_row.inquiry_id is not null and message_row.inquiry_id<>target_inquiry_id then
    raise exception '该邮件已关联其他询盘，不能直接改绑';
  end if;

  select i.* into inquiry_row
  from public.inquiries i
  where i.id=target_inquiry_id
    and i.excluded_from_dashboard=false
    and (i.owner_id=actor_id or actor_role in ('owner','sales_manager'));
  if not found then raise exception '询盘不存在或当前账号无权关联'; end if;

  update public.email_messages
  set inquiry_id=target_inquiry_id,
      association_status='matched',
      association_method='manual_personal_mailbox'
  where id=message_row.id;

  result:=public.record_synced_email_followup(message_row.id);

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(
    actor_id,'email_message',message_row.id,'personal_mailbox_message_linked',
    jsonb_build_object(
      'inquiry_id',target_inquiry_id,
      'direction',message_row.direction,
      'occurred_at',coalesce(message_row.sent_at,message_row.received_at,message_row.created_at),
      'followup_id',result->>'followup_id'
    ),
    '业务员从我的邮箱手动关联询盘并按邮件实际时间生成沟通记录'
  );

  return result||jsonb_build_object(
    'email_message_id',message_row.id,
    'association_method','manual_personal_mailbox'
  );
end;
$$;

revoke all on function public.associate_personal_email_with_inquiry(uuid,uuid) from public,anon;
grant execute on function public.associate_personal_email_with_inquiry(uuid,uuid) to authenticated;

