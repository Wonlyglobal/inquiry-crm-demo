-- Transactional business events, not browser notifications. No historical replay.
begin;
create table private.pipeline_feishu_config(
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 mode text not null default 'status_only' check(mode in('status_only','basic_demand')),
 enabled_at timestamptz,destination_hash text check(destination_hash ~ '^[0-9a-f]{64}$'),
 approved_by text,approval_reason text,last_claimed_at timestamptz,
 check(not enabled or (enabled_at is not null and destination_hash is not null and approved_by is not null and approval_reason is not null and length(approved_by)>=2 and length(approval_reason)>=8))
);
insert into private.pipeline_feishu_config(singleton) values(true);
create table private.pipeline_feishu_queue(
 id uuid primary key default gen_random_uuid(),event_key text not null unique,
 kind text not null check(kind in('inquiry','intake','connection_test')),entity_id uuid,
 inquiry_id uuid,occurred_at timestamptz not null default clock_timestamp(),
 payload jsonb not null check(length(payload::text)<=6000),before_hash text not null,after_hash text not null,
 state text not null default 'pending' check(state in('pending','sending','sent','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 lease_token uuid,lease_until timestamptz,next_attempt_at timestamptz not null default clock_timestamp(),
 sent_at timestamptz,last_error text
);
create index pipeline_feishu_pending on private.pipeline_feishu_queue(next_attempt_at,occurred_at,id) where state in('pending','sending');
create table private.pipeline_feishu_audit(
 id bigint generated always as identity primary key,notice_id uuid references private.pipeline_feishu_queue(id),
 at timestamptz not null default clock_timestamp(),action text not null,details jsonb not null
);
alter table private.pipeline_feishu_config enable row level security;
alter table private.pipeline_feishu_queue enable row level security;
alter table private.pipeline_feishu_audit enable row level security;
revoke all on private.pipeline_feishu_config,private.pipeline_feishu_queue,private.pipeline_feishu_audit from public,anon,authenticated,service_role;
create trigger pipeline_feishu_audit_immutable before update or delete on private.pipeline_feishu_audit for each row execute function private.reject_risk_event_mutation();

create function private.pipeline_person(person uuid) returns text language sql stable security definer set search_path='' as $$
 select left(p.full_name,80) from public.profiles p where p.id=person and p.active and not coalesce(p.is_test_data,false) and p.data_environment='production'
$$;
create function private.pipeline_manager(person uuid) returns text language sql stable security definer set search_path='' as $$
 select case when count(*)=1 then max(left(p.full_name,80)) else null end from public.profiles p
 where p.role='sales_manager' and p.active and not coalesce(p.is_test_data,false) and p.data_environment='production'
 and (person is null or private.crm_manager_covers_user(p.id,person))
$$;
create function private.pipeline_projection(row_data jsonb,kind text) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(row_data) e
 where e.key=any(case when kind='inquiry' then array['status','validity','owner_id','invalid_review_status','product_category','target_country','quantity',
 'demand_summary','qualification_identity','qualification_need','qualification_role','qualification_value','qualification_timing','qualification_fit','qualification_next_step','qualification_manager_confirmed_at','qualification_score','next_follow_up_at','first_valid_contact_at','nurture_status','nurture_next_at','nurture_note','sales_disposition','lead_priority','submitted_for_assignment_at']
 else array['triage_label','processing_status','inquiry_id','trashed_at','assigned_marketing_id','research_completed_at','registered_at','forwarded_at'] end)
$$;
create function private.capture_pipeline_feishu() returns trigger language plpgsql security definer set search_path='' as $$
declare c private.pipeline_feishu_config; n jsonb:=to_jsonb(new);o jsonb; p jsonb; base jsonb; linked public.inquiries;
 kind text:=case when tg_table_name='inquiries' then 'inquiry' else 'intake' end;
 target uuid;owner_id uuid;actor_id uuid;first_hash text;last_hash text;key text;notice uuid;changes jsonb;
begin
 select * into c from private.pipeline_feishu_config where singleton;
 if not c.enabled then return new;end if;
 if kind='inquiry' and (coalesce((n->>'is_test_data')::boolean,false) or n->>'data_environment' is distinct from 'production') then return new;end if;
 if tg_op='UPDATE' then
  o:=to_jsonb(old);
  if kind='inquiry' and (coalesce((o->>'is_test_data')::boolean,false) or o->>'data_environment' is distinct from 'production') then return new;end if;
 else o:='{}';end if;
 if kind='inquiry' and (nullif(n->>'archived_at','') is not null or coalesce((n->>'excluded_from_dashboard')::boolean,false)) then return new;end if;
 -- Old public-mail imports do not masquerade as newly arrived mail; human re-triage still notifies.
 if kind='intake' and tg_op='INSERT' and coalesce((n->>'received_at')::timestamptz,(n->>'created_at')::timestamptz,clock_timestamp())<c.enabled_at then return new;end if;
 first_hash:=md5(private.pipeline_projection(o,kind)::text);last_hash:=md5(private.pipeline_projection(n,kind)::text);
 if first_hash=last_hash then return new;end if;
 select coalesce(jsonb_agg(e.key order by e.key),'[]') into changes from jsonb_each(private.pipeline_projection(n,kind)) e where e.value is distinct from (o->e.key);
 target:=case when kind='inquiry' then (n->>'id')::uuid else nullif(n->>'inquiry_id','')::uuid end;
 if kind='intake' and target is not null then
  select * into linked from public.inquiries where id=target and not coalesce(is_test_data,false) and data_environment='production' and archived_at is null and not coalesce(excluded_from_dashboard,false);
  if not found then return new;end if;base:=to_jsonb(linked);
 else base:=case when kind='inquiry' then n else '{}'::jsonb end;end if;
 owner_id:=nullif(base->>'owner_id','')::uuid;
 actor_id:=coalesce(auth.uid(),nullif(n->>'updated_by','')::uuid,nullif(n->>'triaged_by','')::uuid,nullif(n->>'created_by','')::uuid);
 p:=jsonb_build_object('version',1,'kind',kind,'entity_id',n->>'id','inquiry_id',target,'inquiry_no',base->'inquiry_no',
 'created',tg_op='INSERT','from_status',o->'status','from_validity',o->'validity','from_owner',o->'owner_id',
 'status',base->'status','validity',base->'validity','owner_set',owner_id is not null,
 'owner_name',private.pipeline_person(owner_id),'manager_name',private.pipeline_manager(owner_id),
 'market_name',private.pipeline_person(coalesce(nullif(n->>'assigned_marketing_id','')::uuid,nullif(n->>'triaged_by','')::uuid,case when base->>'nurture_status'='nurturing' then nullif(base->>'nurture_updated_by','')::uuid end,nullif(base->>'created_by','')::uuid)),
 'actor_name',case when auth.uid() is null then null else private.pipeline_person(actor_id) end,
 'triage_label',n->'triage_label','processing_status',n->'processing_status','trashed',nullif(n->>'trashed_at','') is not null,
 'invalid_review_status',base->'invalid_review_status','next_follow_up_at',base->'next_follow_up_at','first_contact_done',nullif(base->>'first_valid_contact_at','') is not null,'nurture_status',base->'nurture_status','sales_disposition',base->'sales_disposition','nurture_next_at',base->'nurture_next_at',
 'raw_product',left(coalesce(base->>'product_category',''),200),'raw_country',left(coalesce(base->>'target_country',''),100),'raw_quantity',left(coalesce(base->>'quantity',''),100),
 'changed_fields',changes);
 -- Converting mail creates an inquiry in the same transaction: one linked event is enough.
 if kind='intake' and target is not null then
  with combined as(update private.pipeline_feishu_queue q set state='cancelled',last_error='combined_with_intake_conversion'
   where q.event_key='inquiry:'||target::text||':'||txid_current()::text and q.state='pending' and q.payload->>'created'='true' returning q.id)
  insert into private.pipeline_feishu_audit(notice_id,action,details) select id,'cancelled','{"reason":"combined_with_intake_conversion"}' from combined;
 end if;
 key:=kind||':'||(n->>'id')||':'||txid_current()::text;
 insert into private.pipeline_feishu_queue(event_key,kind,entity_id,inquiry_id,payload,before_hash,after_hash)
 values(key,kind,(n->>'id')::uuid,target,p,first_hash,last_hash)
 on conflict(event_key) do update set
 payload=excluded.payload||jsonb_build_object('created',pipeline_feishu_queue.payload->'created','from_status',pipeline_feishu_queue.payload->'from_status','from_validity',pipeline_feishu_queue.payload->'from_validity','from_owner',pipeline_feishu_queue.payload->'from_owner',
 'changed_fields',(select coalesce(jsonb_agg(distinct value),'[]') from jsonb_array_elements((pipeline_feishu_queue.payload->'changed_fields')||(excluded.payload->'changed_fields')))),
 inquiry_id=excluded.inquiry_id,after_hash=excluded.after_hash,
 state=case when pipeline_feishu_queue.before_hash=excluded.after_hash then 'cancelled' else 'pending' end
 returning id into notice;
 insert into private.pipeline_feishu_audit(notice_id,action,details) values(notice,'captured',jsonb_build_object('actor_id',actor_id,'transaction',txid_current()::text,'operation',tg_op));
 return new;
end $$;
create trigger inquiries_pipeline_feishu after insert or update on public.inquiries for each row execute function private.capture_pipeline_feishu();
create trigger intake_pipeline_feishu after insert or update on public.email_intake for each row execute function private.capture_pipeline_feishu();

create function public.claim_pipeline_feishu(destination_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.pipeline_feishu_config; result jsonb;stamp timestamptz:=clock_timestamp();
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'worker only';end if;
 select * into c from private.pipeline_feishu_config where singleton for update;
 if not c.enabled or c.destination_hash is distinct from $1 then raise exception 'pipeline destination not authorized';end if;
 if c.last_claimed_at>stamp-interval '30 seconds' then return '[]';end if;
 update private.pipeline_feishu_config set last_claimed_at=stamp where singleton;
 -- Never send a queued business record that has since become test, archived or excluded.
 with cancelled as(update private.pipeline_feishu_queue q set state='cancelled',last_error='record_no_longer_eligible'
 where q.state in('pending','sending') and (
 (q.kind='inquiry' and not exists(select 1 from public.inquiries i where i.id=q.entity_id and not coalesce(i.is_test_data,false) and i.data_environment='production' and i.archived_at is null and not coalesce(i.excluded_from_dashboard,false)))
 or (q.kind='intake' and not exists(select 1 from public.email_intake i where i.id=q.entity_id and (i.inquiry_id is null or exists(select 1 from public.inquiries l where l.id=i.inquiry_id and not coalesce(l.is_test_data,false) and l.data_environment='production' and l.archived_at is null and not coalesce(l.excluded_from_dashboard,false)))))) returning q.id)
 insert into private.pipeline_feishu_audit(notice_id,action,details) select id,'cancelled','{"reason":"record_no_longer_eligible"}' from cancelled;
 with exhausted as(update private.pipeline_feishu_queue set state='failed',last_error='lease_exhausted' where state='sending' and lease_until<=stamp and attempts>=5 returning id)
 insert into private.pipeline_feishu_audit(notice_id,action,details) select id,'failed','{"reason":"lease_exhausted"}' from exhausted;
 with chosen as(select id from private.pipeline_feishu_queue where attempts<5 and next_attempt_at<=stamp and (state='pending' or (state='sending' and lease_until<=stamp)) order by occurred_at,id for update skip locked limit 10),
 claimed as(update private.pipeline_feishu_queue q set state='sending',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=stamp+interval '10 minutes' from chosen s where q.id=s.id returning q.*),
 audited as(insert into private.pipeline_feishu_audit(notice_id,action,details) select id,'claimed',jsonb_build_object('attempt',attempts) from claimed returning notice_id)
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'lease_token',r.lease_token,'occurred_at',r.occurred_at,'mode',c.mode,'payload',r.payload) order by r.occurred_at,r.id),'[]') into result from claimed r join audited a on a.notice_id=r.id;
 return result;
end $$;
create function public.finish_pipeline_feishu(target uuid,lease uuid,succeeded boolean,error_class text default null) returns void language plpgsql security definer set search_path='' as $$
declare q private.pipeline_feishu_queue;stamp timestamptz:=clock_timestamp();code text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'worker only';end if;
 if $3 is null then raise exception 'delivery outcome required';end if;
 code:=case when $4 in('network_or_timeout','provider_rejected','provider_rate_limited','payload_rejected','http_error') then $4 else 'delivery_failed' end;
 select * into q from private.pipeline_feishu_queue where id=$1 and lease_token=$2 and state='sending' and lease_until>stamp for update;
 if q.id is null then raise exception 'stale delivery lease';end if;
 update private.pipeline_feishu_queue set state=case when $3 then 'sent' when attempts>=5 then 'failed' else 'pending' end,
 sent_at=case when $3 then stamp else null end,last_error=case when $3 then null else code end,
 next_attempt_at=case when $3 then next_attempt_at else stamp+least(1800,(30*power(2,attempts))::integer)*interval '1 second' end,
 lease_token=null,lease_until=null where id=$1;
 insert into private.pipeline_feishu_audit(notice_id,action,details) values($1,case when $3 then 'sent' when q.attempts>=5 then 'failed' else 'retry_scheduled' end,jsonb_build_object('attempt',q.attempts,'error_class',case when $3 then null else code end));
end $$;
-- Keeps old browser actions on the new transactional route without a second Feishu send.
create function public.pipeline_feishu_receipt(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();i public.inquiries;c private.pipeline_feishu_config;
begin
 select * into i from public.inquiries where id=$1 and (a.role in('owner','marketing') or owner_id=a.id or (a.role='sales_manager' and private.crm_manager_covers_user(a.id,owner_id)));
 if i.id is null then raise exception '询盘不可见';end if;
 select * into c from private.pipeline_feishu_config where singleton;
 return jsonb_build_object('enabled',c.enabled,'excluded',coalesce(i.is_test_data,false) or i.data_environment is distinct from 'production' or i.archived_at is not null or coalesce(i.excluded_from_dashboard,false),
 'queued',exists(select 1 from private.pipeline_feishu_queue where inquiry_id=$1 and state in('pending','sending','sent')));
end $$;
revoke all on function private.pipeline_person(uuid),private.pipeline_manager(uuid),private.pipeline_projection(jsonb,text),private.capture_pipeline_feishu() from public,anon,authenticated,service_role;
revoke all on function public.claim_pipeline_feishu(text),public.finish_pipeline_feishu(uuid,uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_pipeline_feishu(text),public.finish_pipeline_feishu(uuid,uuid,boolean,text) to service_role;
revoke all on function public.pipeline_feishu_receipt(uuid) from public,anon,service_role;
grant execute on function public.pipeline_feishu_receipt(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
