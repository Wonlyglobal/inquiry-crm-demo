-- Persist customer-reply work instead of deriving it from a browser-limited mail list.
create table if not exists public.email_reply_reminders (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  inbound_message_id uuid not null unique references public.email_messages(id) on delete cascade,
  normalized_subject text not null default '',
  received_at timestamptz not null,
  status text not null default 'open' check (status in ('open','replied','superseded','dismissed')),
  replied_message_id uuid references public.email_messages(id) on delete set null,
  replied_at timestamptz,
  overdue_notified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists email_reply_reminders_owner_open_idx
  on public.email_reply_reminders(owner_id,received_at desc) where status='open';
create index if not exists email_reply_reminders_inquiry_open_idx
  on public.email_reply_reminders(inquiry_id,normalized_subject) where status='open';

alter table public.email_reply_reminders enable row level security;
drop policy if exists email_reply_reminders_visible on public.email_reply_reminders;
create policy email_reply_reminders_visible on public.email_reply_reminders for select to authenticated
using (
  owner_id=(select auth.uid())
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active=true and p.role in ('owner','sales_manager'))
);
grant select on public.email_reply_reminders to authenticated;
grant all on public.email_reply_reminders to service_role;

create or replace function private.email_conversation_subject(value text)
returns text language sql immutable set search_path='' as $$
  select lower(btrim(regexp_replace(coalesce(value,''),'^\s*((re|fw|fwd|答复|回复|转发)\s*[:：]\s*)+','','i')))
$$;

create or replace function private.sync_email_reply_reminder()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  inquiry_owner uuid;
  inquiry_open boolean;
  subject_key text := private.email_conversation_subject(new.subject);
  message_time timestamptz := coalesce(new.received_at,new.sent_at,new.created_at,clock_timestamp());
  inserted_id uuid;
begin
  if new.inquiry_id is null then return new; end if;
  select i.owner_id,(i.validity='valid' and i.status not in ('won','lost'))
    into inquiry_owner,inquiry_open from public.inquiries i where i.id=new.inquiry_id;

  if new.direction='inbound' and inquiry_owner is not null and inquiry_open then
    update public.email_reply_reminders
      set status='superseded',updated_at=clock_timestamp()
      where inquiry_id=new.inquiry_id and normalized_subject=subject_key
        and status='open' and inbound_message_id<>new.id;

    insert into public.email_reply_reminders(
      inquiry_id,owner_id,inbound_message_id,normalized_subject,received_at,status,updated_at
    ) values(new.inquiry_id,inquiry_owner,new.id,subject_key,message_time,'open',clock_timestamp())
    on conflict(inbound_message_id) do update set
      inquiry_id=excluded.inquiry_id,owner_id=excluded.owner_id,
      normalized_subject=excluded.normalized_subject,received_at=excluded.received_at,
      status='open',replied_message_id=null,replied_at=null,
      updated_at=clock_timestamp()
    returning id into inserted_id;

    if inserted_id is not null and not exists(
      select 1 from public.notifications n
      where n.recipient_id=inquiry_owner and n.inquiry_id=new.inquiry_id
        and n.type='customer_email_reply' and n.body like '%'||new.id::text||'%'
    ) then
      insert into public.notifications(recipient_id,inquiry_id,type,title,body)
      values(inquiry_owner,new.inquiry_id,'customer_email_reply','客户有新回复',
        coalesce(nullif(btrim(new.subject),''),'无主题')||' · 邮件记录 '||new.id::text);
    end if;
  elsif new.direction='outbound' then
    update public.email_reply_reminders r set
      status='replied',replied_message_id=new.id,replied_at=message_time,updated_at=clock_timestamp()
    from public.email_messages inbound
    where r.inquiry_id=new.inquiry_id and r.status='open'
      and inbound.id=r.inbound_message_id
      and (
        (nullif(btrim(new.in_reply_to),'') is not null and new.in_reply_to=inbound.message_id)
        or (inbound.message_id is not null and inbound.message_id=any(coalesce(new.reference_ids,'{}'::text[])))
        or r.normalized_subject=subject_key
      );
  end if;
  return new;
end;
$$;

drop trigger if exists sync_email_reply_reminder_on_message on public.email_messages;
create trigger sync_email_reply_reminder_on_message
after insert or update of inquiry_id,direction,message_id,in_reply_to,reference_ids,subject,received_at,sent_at
on public.email_messages for each row execute function private.sync_email_reply_reminder();

create or replace function private.sync_email_reply_reminder_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    if new.owner_id is null then
      update public.email_reply_reminders set status='dismissed',updated_at=clock_timestamp()
      where inquiry_id=new.id and status='open';
    else
      update public.email_reply_reminders set owner_id=new.owner_id,updated_at=clock_timestamp()
      where inquiry_id=new.id and status='open';
    end if;
  end if;
  if new.status in ('won','lost') or new.validity<>'valid' then
    update public.email_reply_reminders set status='dismissed',updated_at=clock_timestamp()
    where inquiry_id=new.id and status='open';
  elsif new.owner_id is not null then
    with ranked as (
      select m.*,private.email_conversation_subject(m.subject) as subject_key,
        row_number() over(partition by private.email_conversation_subject(m.subject)
          order by coalesce(m.received_at,m.sent_at,m.created_at) desc,m.created_at desc) as position
      from public.email_messages m where m.inquiry_id=new.id
    )
    insert into public.email_reply_reminders(
      inquiry_id,owner_id,inbound_message_id,normalized_subject,received_at,status,updated_at
    )
    select new.id,new.owner_id,r.id,r.subject_key,coalesce(r.received_at,r.sent_at,r.created_at),'open',clock_timestamp()
    from ranked r where r.position=1 and r.direction='inbound'
    on conflict(inbound_message_id) do update set
      owner_id=excluded.owner_id,status='open',replied_message_id=null,replied_at=null,updated_at=clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists sync_email_reply_reminder_owner_on_inquiry on public.inquiries;
create trigger sync_email_reply_reminder_owner_on_inquiry
after update of owner_id,status,validity on public.inquiries
for each row execute function private.sync_email_reply_reminder_owner();

-- Backfill current open conversations once, using the latest message in each inquiry/subject thread.
with ranked as (
  select m.*,private.email_conversation_subject(m.subject) as subject_key,
    row_number() over(partition by m.inquiry_id,private.email_conversation_subject(m.subject)
      order by coalesce(m.received_at,m.sent_at,m.created_at) desc,m.created_at desc) as position
  from public.email_messages m where m.inquiry_id is not null
), latest_inbound as (
  select r.*,i.owner_id from ranked r join public.inquiries i on i.id=r.inquiry_id
  where r.position=1 and r.direction='inbound' and i.owner_id is not null
    and i.validity='valid' and i.status not in ('won','lost')
)
insert into public.email_reply_reminders(inquiry_id,owner_id,inbound_message_id,normalized_subject,received_at)
select inquiry_id,owner_id,id,subject_key,coalesce(received_at,sent_at,created_at) from latest_inbound
on conflict(inbound_message_id) do nothing;

create or replace function private.notify_overdue_email_replies()
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  with due as (
    update public.email_reply_reminders r set overdue_notified_at=clock_timestamp(),updated_at=clock_timestamp()
    where r.status='open' and r.received_at<=clock_timestamp()-interval '24 hours'
      and r.overdue_notified_at is null
    returning r.owner_id,r.inquiry_id,r.inbound_message_id,r.received_at
  ), notices as (
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    select d.owner_id,d.inquiry_id,'customer_email_reply_overdue','客户邮件超过24小时未回复',
      '客户来信时间 '||to_char(d.received_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI')||' · 邮件记录 '||d.inbound_message_id::text
    from due d returning 1
  ) select count(*) into inserted_count from notices;
  return inserted_count;
end;
$$;

create extension if not exists pg_cron with schema extensions;
do $$ begin
  if exists(select 1 from cron.job where jobname='notify-overdue-email-replies-hourly') then
    perform cron.unschedule('notify-overdue-email-replies-hourly');
  end if;
  perform cron.schedule('notify-overdue-email-replies-hourly','7 * * * *','select private.notify_overdue_email_replies()');
end $$;
