-- Sales tasks are intentionally limited to manager assignments and genuine
-- customer replies. An arbitrary inbound message that was manually attached
-- to an inquiry must not become a task unless the sender is customer evidence
-- for that inquiry or the message replies to an outbound CRM thread.

create or replace function private.is_genuine_customer_email_reply(
  target_message_id uuid,
  target_inquiry_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.email_messages m
    join public.inquiries i on i.id=target_inquiry_id
    where m.id=target_message_id
      and m.inquiry_id=target_inquiry_id
      and m.direction='inbound'
      and nullif(lower(btrim(m.sender_email)),'') is not null
      and lower(coalesce(m.raw_headers->>'auto-submitted',m.raw_headers->>'Auto-Submitted','')) in ('','no')
      and lower(btrim(m.sender_email)) !~ '^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?)@'
      and (
        exists(
          select 1 from public.contacts c
          where lower(btrim(c.email))=lower(btrim(m.sender_email))
            and (c.id=i.contact_id or c.company_id=i.company_id)
        )
        or exists(
          select 1 from public.email_intake e
          where e.inquiry_id=i.id
            and lower(btrim(e.sender_email))=lower(btrim(m.sender_email))
        )
        or exists(
          select 1 from public.email_messages outbound
          where outbound.inquiry_id=i.id
            and outbound.direction='outbound'
            and nullif(btrim(outbound.message_id),'') is not null
            and (
              m.in_reply_to=outbound.message_id
              or outbound.message_id=any(coalesce(m.reference_ids,'{}'::text[]))
            )
        )
      )
  )
$$;

revoke all on function private.is_genuine_customer_email_reply(uuid,uuid) from public,anon,authenticated;

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

  if new.direction='inbound' and inquiry_owner is not null and inquiry_open
     and private.is_genuine_customer_email_reply(new.id,new.inquiry_id) then
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
  elsif new.direction='inbound' then
    update public.email_reply_reminders
      set status='dismissed',updated_at=clock_timestamp()
      where inbound_message_id=new.id and status='open';
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

revoke all on function private.sync_email_reply_reminder() from public,anon,authenticated;

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
      from public.email_messages m
      where m.inquiry_id=new.id
        and private.is_genuine_customer_email_reply(m.id,new.id)
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

revoke all on function private.sync_email_reply_reminder_owner() from public,anon,authenticated;

-- Preserve history while removing false positives from the active task queue.
update public.email_reply_reminders r
set status='dismissed',updated_at=clock_timestamp()
where r.status='open'
  and not private.is_genuine_customer_email_reply(r.inbound_message_id,r.inquiry_id);

