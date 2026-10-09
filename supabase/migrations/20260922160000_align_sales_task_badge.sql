-- Keep the Today Workbench badge on the same business definition as the
-- task list: manager-assigned inquiries awaiting first valid contact and
-- open, verified customer replies only. Other follow-up work belongs to its
-- dedicated module and must not inflate this badge.

create or replace function public.get_my_sidebar_actionable_counts()
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  actor_id uuid:=auth.uid();
  actor_role public.crm_role;
  unread_mailbox integer:=0;
  today_tasks integer:=0;
begin
  select p.role into actor_role
  from public.profiles p
  where p.id=actor_id and p.active=true;

  if actor_id is null or actor_role not in ('owner','sales_manager','marketing','sales') then
    raise exception '当前账号无权读取侧边栏待办数量';
  end if;

  select count(*)::integer into unread_mailbox
  from public.email_messages m
  join public.mailbox_connections mc on mc.id=m.mailbox_connection_id
  where mc.user_id=actor_id
    and mc.mailbox_kind='personal'
    and mc.status='connected'
    and m.direction='inbound'
    and not exists(
      select 1 from public.email_message_reads r
      where r.email_message_id=m.id and r.user_id=actor_id
    );

  with active_inquiries as (
    select i.id,i.assigned_at,i.first_valid_contact_at
    from public.inquiries i
    where i.owner_id=actor_id
      and i.validity='valid'
      and i.status not in ('won','lost')
      and i.excluded_from_dashboard=false
  ), sales_tasks as (
    select 'assigned:'||i.id::text as task_key
    from active_inquiries i
    where i.assigned_at is not null and i.first_valid_contact_at is null
    union
    select 'email-reply:'||r.inbound_message_id::text
    from public.email_reply_reminders r
    join active_inquiries i on i.id=r.inquiry_id
    where r.owner_id=actor_id and r.status='open'
    union
    select 'whatsapp-reply:'||r.inbound_message_id::text
    from public.whatsapp_reply_reminders r
    join active_inquiries i on i.id=r.inquiry_id
    where r.owner_id=actor_id and r.status='open'
  )
  select count(*)::integer into today_tasks from sales_tasks;

  return jsonb_build_object(
    'mailbox_unread',unread_mailbox,
    'today_tasks',today_tasks,
    'calculated_at',statement_timestamp()
  );
end;
$$;

revoke all on function public.get_my_sidebar_actionable_counts() from public,anon;
grant execute on function public.get_my_sidebar_actionable_counts() to authenticated;
