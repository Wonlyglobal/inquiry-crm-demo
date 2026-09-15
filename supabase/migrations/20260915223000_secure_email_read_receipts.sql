-- Persist mailbox read receipts through one server-authorized workflow.

drop policy if exists email_message_reads_own_insert on public.email_message_reads;
drop policy if exists email_message_reads_own_update on public.email_message_reads;
revoke insert,update on public.email_message_reads from authenticated;

create or replace function public.mark_email_message_read(target_message_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid:=auth.uid();
  actor_role public.crm_role;
  item public.email_messages;
  occurred_at timestamptz:=clock_timestamp();
  already_read boolean;
begin
  select p.role into actor_role
  from public.profiles p
  where p.id=actor_id and p.active=true;
  if actor_id is null or actor_role not in ('owner','sales_manager','marketing','sales') then
    raise exception '当前账号无权读取邮箱消息';
  end if;

  select * into item
  from public.email_messages m
  where m.id=target_message_id
  for share;
  if not found then raise exception '邮件不存在'; end if;
  if item.direction<>'inbound' then raise exception '仅收到的邮件需要标记已读'; end if;

  if not (
    exists(
      select 1 from public.mailbox_connections mc
      where mc.id=item.mailbox_connection_id and mc.user_id=actor_id
    )
    or exists(
      select 1 from public.inquiries i
      where i.id=item.inquiry_id
        and (i.owner_id=actor_id or actor_role in ('owner','sales_manager','marketing'))
    )
    or (item.inquiry_id is null and actor_role in ('owner','sales_manager','marketing'))
  ) then
    raise exception '无权查看该邮件';
  end if;

  select exists(
    select 1 from public.email_message_reads r
    where r.email_message_id=target_message_id and r.user_id=actor_id
  ) into already_read;

  insert into public.email_message_reads(email_message_id,user_id,read_at)
  values(target_message_id,actor_id,occurred_at)
  on conflict(email_message_id,user_id) do update set read_at=excluded.read_at;

  if not already_read then
    insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
    values(actor_id,'email_message',target_message_id,'email_message_read',
      jsonb_build_object('read_at',occurred_at),'用户首次在 CRM 打开并阅读邮件');
  end if;
  return occurred_at;
end;
$$;

revoke all on function public.mark_email_message_read(uuid) from public,anon;
grant execute on function public.mark_email_message_read(uuid) to authenticated;
