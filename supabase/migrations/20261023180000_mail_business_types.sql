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

do $$ begin if (select md5(prosrc) from pg_proc where oid='public.get_sales_mail_type_workspace(uuid,date,integer,boolean)'::regprocedure) is distinct from '1ea5c4951ad34bfd87a6c204377445ba' then raise exception 'source_drift_get_sales_mail_type_workspace'; end if; end $$;

create or replace function public.get_sales_mail_type_workspace(target_sales uuid,target_month date,target_offset integer default 0,target_pending boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.sales_mail_type_scope(auth.uid(),target_sales) then raise exception 'forbidden'; end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month>date_trunc('month',timezone('Asia/Shanghai',now()))::date
 or target_offset is null or target_offset<0 or target_offset>100000 then raise exception 'invalid_period_or_offset'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
 select m.id,m.direction,left(m.subject,300) as subject,private.sales_mail_type_hash(m) as source_hash,
 coalesce(m.sent_at,m.received_at,m.created_at) as occurred_at,
 private.sales_mail_participation(m) as participation,
 e.category,e.method,e.confidence,e.reason,e.evidence,e.model,e.created_at as classified_at
 from public.email_messages m join public.mailbox_connections b on b.id=m.mailbox_connection_id
 left join lateral (select ev.* from public.sales_mail_type_events ev where ev.message_id=m.id and ev.source_hash=private.sales_mail_type_hash(m)
 order by (ev.method='human') desc,ev.created_at desc,ev.id desc limit 1) e on true
 where b.user_id=target_sales and b.mailbox_kind='personal' and private.sales_mail_type_detail(auth.uid(),m.id)
 and (not coalesce(target_pending,false) or e.id is null)
 and coalesce(m.sent_at,m.received_at,m.created_at)>=target_month::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<(target_month+interval '1 month')::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<=clock_timestamp()
 order by occurred_at desc,m.id limit 50 offset target_offset
 ) x;
 return result;
end $$;

do $$ begin if (select md5(prosrc) from pg_proc where oid='public.get_sales_mail_type_review_queue(uuid,date,text,integer)'::regprocedure) is distinct from 'b4b32a3e5ad8e163d6e84d0658c742a6' then raise exception 'source_drift_get_sales_mail_type_review_queue'; end if; end $$;

create or replace function public.get_sales_mail_type_review_queue(target_sales uuid,target_month date,target_filter text default 'review',target_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.sales_mail_type_scope(auth.uid(),target_sales) then raise exception 'forbidden'; end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month>date_trunc('month',timezone('Asia/Shanghai',now()))::date
 or target_filter is null or target_filter not in ('review','skipped','uncertain','human') or target_offset is null or target_offset<0 or target_offset>100000 then raise exception 'invalid_filter_or_period'; end if;
 with eligible as (
 select m.id,m.direction,left(m.subject,300) as subject,private.sales_mail_type_hash(m) as source_hash,
 coalesce(m.sent_at,m.received_at,m.created_at) as occurred_at,
 private.sales_mail_participation(m) as participation,
 e.category,e.method,e.confidence,e.reason,e.evidence,e.model,e.created_at as classified_at
 from public.email_messages m join public.mailbox_connections b on b.id=m.mailbox_connection_id
 join lateral (select ev.* from public.sales_mail_type_events ev where ev.message_id=m.id and ev.source_hash=private.sales_mail_type_hash(m)
 order by (ev.method='human') desc,ev.created_at desc,ev.id desc limit 1) e on true
 where b.user_id=target_sales and b.mailbox_kind='personal' and private.sales_mail_type_detail(auth.uid(),m.id)
 and coalesce(m.sent_at,m.received_at,m.created_at)>=target_month::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<(target_month+interval '1 month')::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<=clock_timestamp()
 and case target_filter when 'review' then e.method='skipped' or (e.method='ai' and e.category='uncertain')
 when 'skipped' then e.method='skipped' when 'uncertain' then e.method='ai' and e.category='uncertain' when 'human' then e.method='human' else false end
 ), page as (select * from eligible order by occurred_at desc,id limit 50 offset target_offset)
 select jsonb_build_object('total',(select count(*) from eligible),'items',coalesce((select jsonb_agg(to_jsonb(p) order by occurred_at desc,id) from page p),'[]'::jsonb)) into result;
 return result;
end $$;

notify pgrst,'reload schema';
commit;
