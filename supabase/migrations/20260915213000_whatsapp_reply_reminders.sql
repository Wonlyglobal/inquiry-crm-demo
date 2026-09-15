-- Persist WhatsApp customer replies so the sales workbench cannot miss them.
create table if not exists public.whatsapp_reply_reminders (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  inbound_message_id uuid not null unique references public.whatsapp_messages(id) on delete cascade,
  remote_phone text not null,
  received_at timestamptz not null,
  status text not null default 'open' check (status in ('open','replied','superseded','dismissed')),
  replied_message_id uuid references public.whatsapp_messages(id) on delete set null,
  replied_at timestamptz,
  overdue_notified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists whatsapp_reply_reminders_owner_open_idx
  on public.whatsapp_reply_reminders(owner_id,received_at desc) where status='open';
create index if not exists whatsapp_reply_reminders_inquiry_phone_open_idx
  on public.whatsapp_reply_reminders(inquiry_id,remote_phone) where status='open';

alter table public.whatsapp_reply_reminders enable row level security;
drop policy if exists whatsapp_reply_reminders_visible on public.whatsapp_reply_reminders;
create policy whatsapp_reply_reminders_visible on public.whatsapp_reply_reminders for select to authenticated
using (
  owner_id=(select auth.uid())
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active=true and p.role in ('owner','sales_manager'))
);
revoke all on public.whatsapp_reply_reminders from anon,authenticated;
grant select on public.whatsapp_reply_reminders to authenticated;
grant all on public.whatsapp_reply_reminders to service_role;

create or replace function private.whatsapp_conversation_phone(value text)
returns text language sql immutable set search_path='' as $$
  select regexp_replace(coalesce(value,''),'[^0-9]','','g')
$$;
revoke all on function private.whatsapp_conversation_phone(text) from public,anon,authenticated;

create or replace function private.sync_whatsapp_reply_reminder()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  inquiry_owner uuid;
  inquiry_open boolean;
  remote_phone_key text:=private.whatsapp_conversation_phone(
    case when new.direction='inbound' then new.sender_phone else new.recipient_phone end
  );
  message_time timestamptz:=coalesce(new.occurred_at,new.created_at,clock_timestamp());
  inserted_id uuid;
begin
  if new.inquiry_id is null or remote_phone_key='' then return new; end if;
  select i.owner_id,(i.validity='valid' and i.status not in ('won','lost'))
    into inquiry_owner,inquiry_open from public.inquiries i where i.id=new.inquiry_id;

  if new.direction='inbound' and inquiry_owner is not null and inquiry_open then
    update public.whatsapp_reply_reminders r set status='superseded',updated_at=clock_timestamp()
    where r.inquiry_id=new.inquiry_id and r.remote_phone=remote_phone_key
      and r.status='open' and r.inbound_message_id<>new.id;

    insert into public.whatsapp_reply_reminders(
      inquiry_id,owner_id,inbound_message_id,remote_phone,received_at,status,updated_at
    ) values(new.inquiry_id,inquiry_owner,new.id,remote_phone_key,message_time,'open',clock_timestamp())
    on conflict(inbound_message_id) do update set
      inquiry_id=excluded.inquiry_id,owner_id=excluded.owner_id,remote_phone=excluded.remote_phone,
      received_at=excluded.received_at,status='open',replied_message_id=null,replied_at=null,
      updated_at=clock_timestamp()
    returning id into inserted_id;

    if inserted_id is not null and not exists(
      select 1 from public.notifications n
      where n.recipient_id=inquiry_owner and n.inquiry_id=new.inquiry_id
        and n.type='customer_whatsapp_reply' and n.body like '%'||new.id::text||'%'
    ) then
      insert into public.notifications(recipient_id,inquiry_id,type,title,body)
      values(inquiry_owner,new.inquiry_id,'customer_whatsapp_reply','WhatsApp 客户有新回复',
        coalesce(nullif(btrim(new.body_text),''),'[非文本消息]')||' · WhatsApp 记录 '||new.id::text);
    end if;
  elsif new.direction='outbound' then
    update public.whatsapp_reply_reminders r set
      status='replied',replied_message_id=new.id,replied_at=message_time,updated_at=clock_timestamp()
    where r.inquiry_id=new.inquiry_id and r.status='open'
      and r.remote_phone=remote_phone_key;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_whatsapp_reply_reminder() from public,anon,authenticated;

drop trigger if exists sync_whatsapp_reply_reminder_on_message on public.whatsapp_messages;
create trigger sync_whatsapp_reply_reminder_on_message
after insert or update of inquiry_id,direction,sender_phone,recipient_phone,occurred_at,delivery_status
on public.whatsapp_messages for each row execute function private.sync_whatsapp_reply_reminder();

create or replace function private.sync_whatsapp_reply_reminder_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    if new.owner_id is null then
      update public.whatsapp_reply_reminders set status='dismissed',updated_at=clock_timestamp()
      where inquiry_id=new.id and status='open';
    else
      update public.whatsapp_reply_reminders set owner_id=new.owner_id,updated_at=clock_timestamp()
      where inquiry_id=new.id and status='open';
    end if;
  end if;
  if new.status in ('won','lost') or new.validity<>'valid' then
    update public.whatsapp_reply_reminders set status='dismissed',updated_at=clock_timestamp()
    where inquiry_id=new.id and status='open';
  elsif new.owner_id is not null then
    with ranked as (
      select m.*,private.whatsapp_conversation_phone(
        case when m.direction='inbound' then m.sender_phone else m.recipient_phone end
      ) as remote_phone_key,
      row_number() over(partition by private.whatsapp_conversation_phone(
        case when m.direction='inbound' then m.sender_phone else m.recipient_phone end
      ) order by m.occurred_at desc,m.created_at desc) as position
      from public.whatsapp_messages m where m.inquiry_id=new.id
    )
    insert into public.whatsapp_reply_reminders(
      inquiry_id,owner_id,inbound_message_id,remote_phone,received_at,status,updated_at
    )
    select new.id,new.owner_id,r.id,r.remote_phone_key,coalesce(r.occurred_at,r.created_at),'open',clock_timestamp()
    from ranked r where r.position=1 and r.direction='inbound' and r.remote_phone_key<>''
    on conflict(inbound_message_id) do update set
      owner_id=excluded.owner_id,status='open',replied_message_id=null,replied_at=null,updated_at=clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function private.sync_whatsapp_reply_reminder_owner() from public,anon,authenticated;

drop trigger if exists sync_whatsapp_reply_reminder_owner_on_inquiry on public.inquiries;
create trigger sync_whatsapp_reply_reminder_owner_on_inquiry
after update of owner_id,status,validity on public.inquiries
for each row execute function private.sync_whatsapp_reply_reminder_owner();

with ranked as (
  select m.*,private.whatsapp_conversation_phone(
    case when m.direction='inbound' then m.sender_phone else m.recipient_phone end
  ) as remote_phone_key,
  row_number() over(partition by m.inquiry_id,private.whatsapp_conversation_phone(
    case when m.direction='inbound' then m.sender_phone else m.recipient_phone end
  ) order by m.occurred_at desc,m.created_at desc) as position
  from public.whatsapp_messages m where m.inquiry_id is not null
), latest_inbound as (
  select r.*,i.owner_id from ranked r join public.inquiries i on i.id=r.inquiry_id
  where r.position=1 and r.direction='inbound' and r.remote_phone_key<>'' and i.owner_id is not null
    and i.validity='valid' and i.status not in ('won','lost')
)
insert into public.whatsapp_reply_reminders(inquiry_id,owner_id,inbound_message_id,remote_phone,received_at)
select inquiry_id,owner_id,id,remote_phone_key,coalesce(occurred_at,created_at) from latest_inbound
on conflict(inbound_message_id) do nothing;

create or replace function private.notify_overdue_whatsapp_replies()
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  with due as (
    update public.whatsapp_reply_reminders r set overdue_notified_at=clock_timestamp(),updated_at=clock_timestamp()
    where r.status='open' and r.received_at<=clock_timestamp()-interval '24 hours'
      and r.overdue_notified_at is null
    returning r.owner_id,r.inquiry_id,r.inbound_message_id,r.received_at
  ), notices as (
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    select d.owner_id,d.inquiry_id,'customer_whatsapp_reply_overdue','WhatsApp 客户消息超过24小时未回复',
      '客户消息时间 '||to_char(d.received_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI')||' · WhatsApp 记录 '||d.inbound_message_id::text
    from due d returning 1
  ) select count(*) into inserted_count from notices;
  return inserted_count;
end;
$$;
revoke all on function private.notify_overdue_whatsapp_replies() from public,anon,authenticated;

do $$ begin
  if exists(select 1 from cron.job where jobname='notify-overdue-whatsapp-replies-hourly') then
    perform cron.unschedule('notify-overdue-whatsapp-replies-hourly');
  end if;
  perform cron.schedule('notify-overdue-whatsapp-replies-hourly','17 * * * *','select private.notify_overdue_whatsapp_replies()');
end $$;
