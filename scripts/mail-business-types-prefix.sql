begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
-- Do not invalidate or rewrite existing classifications/source hashes.
alter table public.sales_mail_type_events drop constraint sales_mail_type_events_category_check;
alter table public.sales_mail_type_events add constraint sales_mail_type_events_category_check check(category in
 ('new_inquiry','customer_reply','quotation_order','after_sales','outreach','promotion','system_notice','suspected_spam','uncertain','business_followup','project_materials'));

-- Participation is derived from the envelope, independent of the semantic category.
-- Only an enum is returned; no recipient/sender identities become newly visible.
create function private.sales_mail_participation(m public.email_messages)
returns text language sql stable security definer set search_path='' as $$
 select case when m.direction='outbound' and substring(lower(coalesce(m.sender_email,'')) from '[a-z0-9._%+-]+@[a-z0-9.-]+')=lower(p.email) then 'sender'
 when lower(p.email)=any(array(select lower(v) from unnest(m.recipient_emails) v)) then 'recipient'
 when lower(p.email)=any(array(select lower(v) from unnest(m.cc_emails) v)) then 'copied'
 else 'unknown' end
 from public.mailbox_connections b join public.profiles p on p.id=b.user_id where b.id=m.mailbox_connection_id and b.mailbox_kind='personal'
$$;
revoke all on function private.sales_mail_participation(public.email_messages) from public,anon,authenticated,service_role;

create function private.sales_mail_outreach_sender_only()
returns trigger language plpgsql security definer set search_path='' as $$
declare participation text;
begin
 if new.category='outreach' then
  select private.sales_mail_participation(m) into participation from public.email_messages m where m.id=new.message_id;
  if participation is distinct from 'sender' then raise exception 'outreach_requires_personal_sender'; end if;
 end if;
 return new;
end $$;
revoke all on function private.sales_mail_outreach_sender_only() from public,anon,authenticated,service_role;
create trigger sales_mail_type_outreach_sender_check before insert on public.sales_mail_type_events
for each row execute function private.sales_mail_outreach_sender_only();
