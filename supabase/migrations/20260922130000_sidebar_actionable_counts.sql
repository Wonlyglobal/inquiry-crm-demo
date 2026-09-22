-- Return actionable sidebar counts without exposing mailbox contents to the client.

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
  today_end timestamptz:=(((statement_timestamp() at time zone 'Asia/Shanghai')::date + 1) at time zone 'Asia/Shanghai');
  expiring_end date:=((statement_timestamp() at time zone 'Asia/Shanghai')::date + 7);
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
    select i.*
    from public.inquiries i
    where i.owner_id=actor_id
      and i.validity='valid'
      and i.status not in ('won','lost')
      and i.excluded_from_dashboard=false
  ), latest_quotes as (
    select distinct on (q.inquiry_id) q.inquiry_id,q.status
    from public.quotation_versions q
    join active_inquiries i on i.id=q.inquiry_id
    order by q.inquiry_id,q.created_at desc
  ), actionable as (
    select 'email-reply:'||r.inbound_message_id::text as task_key
    from public.email_reply_reminders r
    join active_inquiries i on i.id=r.inquiry_id
    where r.owner_id=actor_id and r.status='open'
    union
    select 'whatsapp-reply:'||r.inbound_message_id::text
    from public.whatsapp_reply_reminders r
    join active_inquiries i on i.id=r.inquiry_id
    where r.owner_id=actor_id and r.status='open'
    union
    select 'followup:'||f.id::text
    from public.follow_ups f
    join active_inquiries i on i.id=f.inquiry_id
    where f.author_id=actor_id and f.completed_at is null
      and f.next_follow_up_at is not null and f.next_follow_up_at<today_end
    union
    select 'first-response:'||i.id::text
    from active_inquiries i
    where i.assigned_at is not null and i.first_valid_contact_at is null
      and (i.first_contact_due_at<statement_timestamp() or i.assigned_at>=today_end-interval '1 day')
    union
    select 'quotation:'||i.id::text
    from active_inquiries i
    left join latest_quotes q on q.inquiry_id=i.id
    where i.status in ('qualified','contacted')
      and coalesce(q.status,'') not in ('pending_approval','sent')
    union
    select 'retention:'||i.id::text
    from active_inquiries i
    where i.retained_until is not null and i.retained_until<=expiring_end
    union
    select 'quality:'||a.inquiry_id::text||':'||a.alert_key
    from public.data_quality_alerts a
    join active_inquiries i on i.id=a.inquiry_id
    where a.owner_id=actor_id and a.resolved_at is null
  )
  select count(*)::integer into today_tasks from actionable;

  return jsonb_build_object(
    'mailbox_unread',unread_mailbox,
    'today_tasks',today_tasks,
    'calculated_at',statement_timestamp()
  );
end;
$$;

revoke all on function public.get_my_sidebar_actionable_counts() from public,anon;
grant execute on function public.get_my_sidebar_actionable_counts() to authenticated;
