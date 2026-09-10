-- Bind a sent quotation to the real IMAP message and only count replies in that thread.

create or replace function private.link_synced_quotation_message()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  quote_id uuid;
begin
  if new.direction<>'outbound' or new.inquiry_id is null or nullif(trim(new.message_id),'') is null then return new; end if;

  select q.id into quote_id
  from public.quotation_versions q
  where q.inquiry_id=new.inquiry_id
    and q.status='sent'
    and q.sent_message_id is null
    and q.sent_at is not null
    and coalesce(new.sent_at,new.created_at)>=q.sent_at-interval '10 minutes'
    and coalesce(new.sent_at,new.created_at)<=q.sent_at+interval '24 hours'
    and (q.quote_no is null or coalesce(new.subject,'') ilike '%'||q.quote_no||'%')
  order by abs(extract(epoch from (coalesce(new.sent_at,new.created_at)-q.sent_at)))
  limit 1;

  if quote_id is not null then
    update public.quotation_versions
    set sent_message_id=new.id,updated_at=clock_timestamp()
    where id=quote_id and sent_message_id is null;
  end if;
  return new;
end;
$$;

revoke all on function private.link_synced_quotation_message() from public,anon,authenticated;
drop trigger if exists email_message_link_sent_quotation on public.email_messages;
create trigger email_message_link_sent_quotation
after insert or update of inquiry_id,direction,message_id,sent_at,subject on public.email_messages
for each row execute function private.link_synced_quotation_message();

-- Backfill sent quotations that were synchronized before this precise linker existed.
with candidates as (
  select q.id as quote_id,m.id as message_id,
    row_number() over(partition by q.id order by abs(extract(epoch from (coalesce(m.sent_at,m.created_at)-q.sent_at)))) as position
  from public.quotation_versions q
  join public.email_messages m on m.inquiry_id=q.inquiry_id and m.direction='outbound'
  where q.status='sent' and q.sent_at is not null and q.sent_message_id is null
    and nullif(trim(m.message_id),'') is not null
    and coalesce(m.sent_at,m.created_at)>=q.sent_at-interval '10 minutes'
    and coalesce(m.sent_at,m.created_at)<=q.sent_at+interval '24 hours'
    and (q.quote_no is null or coalesce(m.subject,'') ilike '%'||q.quote_no||'%')
)
update public.quotation_versions q
set sent_message_id=c.message_id,updated_at=clock_timestamp()
from candidates c
where q.id=c.quote_id and c.position=1;

create or replace function private.track_quotation_customer_reply()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  quote_id uuid;
  quote_creator uuid;
  affected integer;
  reply_time timestamptz:=coalesce(new.received_at,new.created_at,clock_timestamp());
begin
  if new.direction<>'inbound' or new.inquiry_id is null then return new; end if;

  select q.id,q.created_by into quote_id,quote_creator
  from public.quotation_versions q
  join public.email_messages sent_message on sent_message.id=q.sent_message_id
  where q.inquiry_id=new.inquiry_id
    and q.status='sent'
    and sent_message.message_id is not null
    and (
      new.in_reply_to=sent_message.message_id
      or sent_message.message_id=any(coalesce(new.reference_ids,'{}'::text[]))
    )
  order by q.sent_at desc
  limit 1;

  if quote_id is null then return new; end if;
  update public.quotation_versions
  set customer_replied_at=reply_time,customer_reply_message_id=new.id,updated_at=clock_timestamp()
  where id=quote_id and (customer_replied_at is null or reply_time>customer_replied_at);
  get diagnostics affected=row_count;
  if affected>0 then
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(quote_creator,new.inquiry_id,'quotation_customer_replied','客户已回复报价',coalesce(new.subject,'客户回复了已发送的报价'));
  end if;
  return new;
end;
$$;

revoke all on function private.track_quotation_customer_reply() from public,anon,authenticated;
