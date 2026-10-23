begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

-- Independent, append-only observations. Never mutate mail, inquiries or scores.
create table public.sales_mail_type_events (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.email_messages(id),
 source_hash text not null check(length(source_hash)=32),
 category text not null check(category in ('new_inquiry','customer_reply','quotation_order','after_sales','outreach','promotion','system_notice','suspected_spam','uncertain')),
 method text not null check(method in ('ai','human','skipped','failed')),
 confidence numeric check(confidence between 0 and 1),
 reason text not null check(length(reason) between 2 and 1000),
 evidence text not null default '' check(length(evidence)<=240),
 provider text not null,model text not null,policy_version text not null,
 actor_id uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp()
);
create index sales_mail_type_events_message_idx on public.sales_mail_type_events(message_id,created_at desc,id desc);
create unique index sales_mail_type_events_ai_once on public.sales_mail_type_events(message_id,source_hash,policy_version) where method in ('ai','skipped','failed');
alter table public.sales_mail_type_events enable row level security;
revoke all on public.sales_mail_type_events from public,anon,authenticated;
grant select on public.sales_mail_type_events to authenticated;
-- Only the controlled RPC can append even for service_role.
revoke all on public.sales_mail_type_events from service_role;
grant select on public.sales_mail_type_events to service_role;

create function private.sales_mail_type_scope(target_actor uuid,target_sales uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles a join public.profiles s on s.id=target_sales
 where a.id=target_actor and a.active and not a.is_test_data and a.data_environment='production'
 and s.active and s.role='sales' and not s.is_test_data and s.data_environment='production'
 and (a.role='owner' or (a.role='sales' and a.id=s.id)
 or (a.role='sales_manager' and a.team is not distinct from s.team)))
$$;
create function private.sales_mail_type_detail(target_actor uuid,target_message uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.email_messages m join public.mailbox_connections b on b.id=m.mailbox_connection_id
 join public.profiles a on a.id=target_actor
 where m.id=target_message and b.mailbox_kind='personal' and private.sales_mail_type_scope(target_actor,b.user_id)
 and (target_actor=auth.uid() or auth.role()='service_role')
 and not exists(select 1 from public.inquiries i where i.id=m.inquiry_id and (i.is_test_data or i.data_environment<>'production'))
 and (a.role='owner' or b.user_id=a.id or (a.role='sales_manager' and private.crm_manager_covers_inquiry(target_actor,m.inquiry_id))))
$$;
create function private.sales_mail_type_hash(m public.email_messages)
returns text language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(m.direction,m.subject,m.body_text,m.inquiry_id,m.sender_email,m.recipient_emails)::text)
$$;
revoke all on function private.sales_mail_type_scope(uuid,uuid),private.sales_mail_type_detail(uuid,uuid),private.sales_mail_type_hash(public.email_messages) from public,anon,authenticated;
grant execute on function private.sales_mail_type_scope(uuid,uuid) to service_role;
grant execute on function private.sales_mail_type_detail(uuid,uuid) to authenticated,service_role;
create policy sales_mail_type_read on public.sales_mail_type_events for select to authenticated
 using(private.sales_mail_type_detail((select auth.uid()),message_id));
create function private.sales_mail_type_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception '邮件分类历史仅追加，不允许覆盖或删除'; end $$;
create trigger sales_mail_type_no_rewrite before update or delete on public.sales_mail_type_events
for each row execute function private.sales_mail_type_immutable();
revoke all on function private.sales_mail_type_immutable() from public,anon,authenticated,service_role;

-- Append through actor/scope/source checks; service callers cannot fabricate evidence.
create function public.record_sales_mail_type(target_message uuid,target_hash text,target_category text,target_method text,
 target_confidence numeric,target_reason text,target_evidence text,target_model text,target_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.email_messages; result uuid;
begin
 if not private.sales_mail_type_detail(target_actor,target_message) then raise exception 'forbidden'; end if;
 select * into m from public.email_messages where id=target_message for share;
 if private.sales_mail_type_hash(m) is distinct from target_hash then raise exception 'source_changed'; end if;
 if target_method not in ('ai','skipped','failed') then raise exception 'invalid_method'; end if;
 if target_method='ai' and (target_confidence is null or target_confidence<0 or target_confidence>1
 or length(trim(coalesce(target_evidence,'')))<3 or position(target_evidence in coalesce(m.body_text,''))=0) then raise exception 'invalid_evidence'; end if;
 if target_method<>'ai' and target_category<>'uncertain' then raise exception 'invalid_skipped_category'; end if;
 insert into public.sales_mail_type_events(message_id,source_hash,category,method,confidence,reason,evidence,provider,model,policy_version,actor_id)
 values(target_message,target_hash,target_category,target_method,target_confidence,target_reason,coalesce(target_evidence,''),
 case when target_method='ai' then 'aliyun_bailian_beijing' else 'crm' end,target_model,'bailian-redacted-mail-types-v1',target_actor)
 on conflict do nothing returning id into result;
 if result is not null then
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
 values(target_actor,'email_message',target_message,'sales_mail_type_recorded',jsonb_build_object('event_id',result,'category',target_category,'method',target_method,'policy','bailian-redacted-mail-types-v1'),left(target_reason,1000));
 end if;
 return result;
end $$;
revoke all on function public.record_sales_mail_type(uuid,text,text,text,numeric,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_sales_mail_type(uuid,text,text,text,numeric,text,text,text,uuid) to service_role;

create function public.review_sales_mail_type(target_message uuid,target_hash text,target_category text,target_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.email_messages; result uuid;
begin
 if not private.sales_mail_type_detail(auth.uid(),target_message) then raise exception 'forbidden'; end if;
 if length(trim(coalesce(target_reason,'')))<5 then raise exception '请填写至少5个字的复核依据'; end if;
 select * into m from public.email_messages where id=target_message for share;
 if private.sales_mail_type_hash(m) is distinct from target_hash then raise exception 'source_changed'; end if;
 insert into public.sales_mail_type_events(message_id,source_hash,category,method,confidence,reason,provider,model,policy_version,actor_id)
 values(target_message,target_hash,target_category,'human',null,target_reason,'human','manual','mail-types-v1',auth.uid()) returning id into result;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
 values(auth.uid(),'email_message',target_message,'sales_mail_type_reviewed',jsonb_build_object('event_id',result,'category',target_category,'source_hash',target_hash),target_reason);
 return result;
end $$;
revoke all on function public.review_sales_mail_type(uuid,text,text,text) from public,anon;
grant execute on function public.review_sales_mail_type(uuid,text,text,text) to authenticated;

create function public.get_sales_mail_type_workspace(target_sales uuid,target_month date,target_offset integer default 0,target_pending boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.sales_mail_type_scope(auth.uid(),target_sales) then raise exception 'forbidden'; end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month>date_trunc('month',timezone('Asia/Shanghai',now()))::date
 or target_offset is null or target_offset<0 or target_offset>100000 then raise exception 'invalid_period_or_offset'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
 select m.id,m.direction,left(m.subject,300) as subject,private.sales_mail_type_hash(m) as source_hash,
 coalesce(m.sent_at,m.received_at,m.created_at) as occurred_at,
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
revoke all on function public.get_sales_mail_type_workspace(uuid,date,integer,boolean) from public,anon;
grant execute on function public.get_sales_mail_type_workspace(uuid,date,integer,boolean) to authenticated;

create function public.begin_sales_mail_type_batch(target_actor uuid,target_sales uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.sales_mail_type_scope(target_actor,target_sales) then raise exception 'forbidden'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_actor::text,231023));
 if (select count(*) from public.audit_logs where actor_id=target_actor and action='sales_mail_type_batch_requested' and created_at>clock_timestamp()-interval '10 minutes')>=30 then raise exception 'rate_limited'; end if;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason)
 values(target_actor,'profile',target_sales,'sales_mail_type_batch_requested','用户显式请求最多2封的脱敏类型建议；不自动改业务状态');
end $$;
revoke all on function public.begin_sales_mail_type_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_sales_mail_type_batch(uuid,uuid) to service_role;

-- Counts only: includes unlinked messages without giving managers access to private bodies.
create function public.get_sales_mail_type_summary(target_month date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles a where a.id=auth.uid() and a.active and a.role in ('owner','sales_manager','sales')) then raise exception 'forbidden'; end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month>date_trunc('month',timezone('Asia/Shanghai',now()))::date then raise exception 'invalid_period'; end if;
 with scope as (select p.id from public.profiles p where private.sales_mail_type_scope(auth.uid(),p.id)),
 messages as (
 select b.user_id as sales_id,m.id,e.category,e.method
 from public.email_messages m join public.mailbox_connections b on b.id=m.mailbox_connection_id and b.mailbox_kind='personal'
 join scope s on s.id=b.user_id
 left join lateral (select ev.category,ev.method from public.sales_mail_type_events ev where ev.message_id=m.id and ev.source_hash=private.sales_mail_type_hash(m)
 order by (ev.method='human') desc,ev.created_at desc,ev.id desc limit 1) e on true
 where not exists(select 1 from public.inquiries i where i.id=m.inquiry_id and (i.is_test_data or i.data_environment<>'production'))
 and coalesce(m.sent_at,m.received_at,m.created_at)>=target_month::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<(target_month+interval '1 month')::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<=clock_timestamp()
 ), grouped as (select sales_id,category,method,count(*) as n from messages group by sales_id,category,method)
 select coalesce(jsonb_agg(jsonb_build_object('sales_id',s.id,
 'total',(select count(*) from messages m where m.sales_id=s.id),
 'pending',(select count(*) from messages m where m.sales_id=s.id and m.method is null),
 'skipped',(select count(*) from messages m where m.sales_id=s.id and m.method='skipped'),
 'failed',(select count(*) from messages m where m.sales_id=s.id and m.method='failed'),
 'confirmed',coalesce((select jsonb_object_agg(g.category,g.n) from grouped g where g.sales_id=s.id and g.method='human'),'{}'::jsonb),
 'suggested',coalesce((select jsonb_object_agg(g.category,g.n) from grouped g where g.sales_id=s.id and g.method='ai'),'{}'::jsonb)
 )),'[]'::jsonb) into result from scope s;
 return jsonb_build_object('month',to_char(target_month,'YYYY-MM'),'people',result,'policy','observation_only_no_performance_score');
end $$;
revoke all on function public.get_sales_mail_type_summary(date) from public,anon;
grant execute on function public.get_sales_mail_type_summary(date) to authenticated;
notify pgrst,'reload schema';
commit;
