-- Reversible attribution correction. Original messages and derived contents stay
-- in place; only a controlled correction can retire a business relationship.
begin;

create table private.mail_attribution_correction_batches (
  id uuid primary key,
  operation_key text not null unique,
  source_inquiry_id uuid not null,
  scope_message_ids uuid[] not null check(cardinality(scope_message_ids) between 1 and 100),
  source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{32}$'),
  authorization_basis text not null check(length(authorization_basis)>=20),
  executor text not null check(executor='database-maintenance'),
  reason text not null check(length(reason)>=20),
  created_at timestamptz not null default clock_timestamp()
);
create table private.mail_attribution_correction_entries (
  batch_id uuid not null references private.mail_attribution_correction_batches(id),
  message_id uuid not null,
  notice_kind text not null check(notice_kind in('junk_digest','bounce','login_notice','provider_notice')),
  source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{32}$'),
  before_association jsonb not null,
  after_association jsonb not null,
  primary key(batch_id,message_id)
);
create table private.mail_attribution_correction_routes (
  batch_id uuid not null references private.mail_attribution_correction_batches(id),
  table_name text not null check(table_name in('follow_ups','communication_summaries','email_reply_reminders')),
  row_id uuid not null,
  before_route jsonb not null,
  content_fingerprint text not null check(content_fingerprint ~ '^[a-f0-9]{32}$'),
  primary key(batch_id,table_name,row_id)
);

alter table private.mail_attribution_correction_batches enable row level security;
alter table private.mail_attribution_correction_entries enable row level security;
alter table private.mail_attribution_correction_routes enable row level security;
revoke all on private.mail_attribution_correction_batches,private.mail_attribution_correction_entries,private.mail_attribution_correction_routes from public,anon,authenticated,crm_marketing_readonly,service_role;
create trigger mail_attribution_batches_immutable before update or delete on private.mail_attribution_correction_batches for each row execute function private.reject_risk_event_mutation();
create trigger mail_attribution_entries_immutable before update or delete on private.mail_attribution_correction_entries for each row execute function private.reject_risk_event_mutation();
create trigger mail_attribution_routes_immutable before update or delete on private.mail_attribution_correction_routes for each row execute function private.reject_risk_event_mutation();

-- A normal communication must still belong to an inquiry. NULL is permitted
-- only for retained history with a real immutable correction batch. Existing
-- caller RPCs and write RLS are unchanged; clients gain no archival write path.
alter table public.follow_ups add column attribution_correction_id uuid references private.mail_attribution_correction_batches(id);
alter table public.follow_ups alter column inquiry_id drop not null;
alter table public.follow_ups add constraint follow_ups_attribution_state check(
  (inquiry_id is not null and attribution_correction_id is null) or
  (inquiry_id is null and attribution_correction_id is not null)
);
alter table public.communication_summaries add column attribution_correction_id uuid references private.mail_attribution_correction_batches(id);
alter table public.communication_summaries alter column inquiry_id drop not null;
alter table public.communication_summaries add constraint communication_summaries_attribution_state check(
  (inquiry_id is not null and attribution_correction_id is null) or
  (inquiry_id is null and attribution_correction_id is not null)
);
alter table public.email_reply_reminders add column attribution_correction_id uuid references private.mail_attribution_correction_batches(id);
alter table public.email_reply_reminders alter column inquiry_id drop not null;
alter table public.email_reply_reminders add constraint email_reply_reminders_attribution_state check(
  (inquiry_id is not null and attribution_correction_id is null) or
  (inquiry_id is null and attribution_correction_id is not null)
);
create policy follow_ups_current_attribution on public.follow_ups as restrictive for select to public using(attribution_correction_id is null);
create policy communication_summaries_current_attribution on public.communication_summaries as restrictive for select to public using(attribution_correction_id is null);
create policy email_reply_reminders_current_attribution on public.email_reply_reminders as restrictive for select to public using(attribution_correction_id is null);

-- Detached personal messages must not become visible to every triage role just
-- because inquiry_id becomes NULL. Keep operational notices with the existing
-- active mailbox owner or the original owner role, under the original RLS too.
create function private.can_read_system_notice(mailbox_id uuid,method text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce($2,'') not in('system_notice_filter','system_notice_correction_v1') or exists(
  select 1 from public.profiles p
  where p.id=coalesce(auth.uid(),private.crm_readonly_uid()) and p.active
    and not coalesce(p.is_test_data,false) and p.data_environment='production'
    and (p.role='owner' or exists(select 1 from public.mailbox_connections mc where mc.id=$1 and mc.user_id=p.id))
 )
$$;
revoke all on function private.can_read_system_notice(uuid,text) from public,anon,service_role;
grant execute on function private.can_read_system_notice(uuid,text) to authenticated,crm_marketing_readonly;
create policy email_messages_system_notice_scope on public.email_messages as restrictive for select to public
 using(private.can_read_system_notice(mailbox_connection_id,association_method));

-- Re-sync of an explicitly corrected source must never resurrect its old
-- contact/thread match, even during a worker rollout. No body is inspected here.
create function private.preserve_corrected_mail_attribution()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.mail_attribution_correction_entries e where e.message_id=new.id) then
   new.inquiry_id:=null;
   new.association_status:='ignored';
   new.association_method:='system_notice_correction_v1';
 end if;
 return new;
end
$$;
revoke all on function private.preserve_corrected_mail_attribution() from public,anon,authenticated,crm_marketing_readonly,service_role;
create trigger preserve_corrected_mail_attribution before update of inquiry_id,association_status,association_method on public.email_messages
 for each row execute function private.preserve_corrected_mail_attribution();

-- Definer scoring bypasses RLS, so exclude retained correction history there
-- explicitly. Exact pre-image guard avoids patching a different live version.
do $patch$
declare source text; definition text; needle text:='from public.email_reply_reminders e where e.owner_id=item.sales_id';
begin
 select prosrc,pg_get_functiondef(oid) into source,definition from pg_proc where oid='public.calculate_sales_360_cycle(uuid)'::regprocedure;
 if md5(source)<>'457eb75afe08140233600e18e0657d8b' or position(needle in definition)=0 then
  raise exception 'sales scoring source drift; review before applying attribution migration';
 end if;
 definition:=replace(definition,needle,needle||' and e.attribution_correction_id is null');
 definition:=replace(definition,'from public.follow_ups f where f.author_id=item.sales_id','from public.follow_ups f where f.attribution_correction_id is null and f.author_id=item.sales_id');
 execute definition;
end
$patch$;

do $patch$
declare source text; definition text; needle text:=E'from public.follow_ups\n    where author_id=actor.id';
begin
 select prosrc,pg_get_functiondef(oid) into source,definition from pg_proc where oid='public.save_or_submit_daily_report(date,text,text,text,boolean)'::regprocedure;
 if md5(source)<>'265a10bd9fa71eec38c547ab5cd29e5d' or position(needle in definition)=0 then
  raise exception 'daily report source drift; review before applying attribution migration';
 end if;
 execute replace(definition,needle,E'from public.follow_ups\n    where attribution_correction_id is null and author_id=actor.id');
end
$patch$;

notify pgrst,'reload schema';
commit;
