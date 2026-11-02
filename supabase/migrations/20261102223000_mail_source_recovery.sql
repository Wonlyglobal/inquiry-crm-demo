-- Exact maintenance scope only. No end-user search API or credential output.
begin;
create table private.mail_source_recovery_batches(
 id uuid primary key,operation_key text not null unique,
 reminder_ids uuid[] not null check(cardinality(reminder_ids) between 1 and 15),
 authorization_basis text not null check(length(authorization_basis)>=30),
 executor text not null check(executor='database-maintenance'),
 created_at timestamptz not null default clock_timestamp()
);
create table private.mail_source_recovery_jobs(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references private.mail_source_recovery_batches(id),
 mailbox_id uuid not null references public.mailbox_connections(id),
 tasks jsonb not null check(jsonb_typeof(tasks)='array' and jsonb_array_length(tasks) between 1 and 31),
 state text not null default 'queued' check(state in('queued','running','completed','partial','blocked','failed')),
 attempts integer not null default 0 check(attempts between 0 and 3),lease_id uuid,leased_until timestamptz,
 result jsonb not null default '{}'::jsonb,updated_at timestamptz not null default clock_timestamp(),
 unique(batch_id,mailbox_id)
);
create table private.mail_source_recovery_events(
 id bigint generated always as identity primary key,job_id uuid not null references private.mail_source_recovery_jobs(id),
 event_type text not null check(event_type in('claimed','completed','partial','blocked','failed')),
 data jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table private.mail_source_recovery_batches enable row level security;
alter table private.mail_source_recovery_jobs enable row level security;
alter table private.mail_source_recovery_events enable row level security;
revoke all on private.mail_source_recovery_batches,private.mail_source_recovery_jobs,private.mail_source_recovery_events from public,anon,authenticated,crm_marketing_readonly,service_role;
create trigger mail_source_recovery_batches_immutable before update or delete on private.mail_source_recovery_batches for each row execute function private.reject_risk_event_mutation();
create trigger mail_source_recovery_events_immutable before update or delete on private.mail_source_recovery_events for each row execute function private.reject_risk_event_mutation();

create function public.claim_mail_source_recovery()
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.mail_source_recovery_jobs; item jsonb; batch private.mail_source_recovery_batches;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_only';end if;
 select j.* into job from private.mail_source_recovery_jobs j
 where (j.state in('queued','partial','failed') or (j.state='running' and j.leased_until<clock_timestamp())) and j.attempts<3
 order by j.updated_at,j.id for update skip locked limit 1;
 if job.id is null then return null;end if;
 select * into batch from private.mail_source_recovery_batches b where b.id=job.batch_id;
 for item in select value from jsonb_array_elements(job.tasks) loop
  if not ((item->>'reminder_id')::uuid=any(batch.reminder_ids)) or (item->>'mailbox_id')::uuid<>job.mailbox_id
    or not exists(select 1 from public.email_messages m where m.id=(item->>'reminder_id')::uuid and m.mailbox_connection_id=job.mailbox_id and md5(coalesce(m.body_text,'')||E'\n'||coalesce(m.body_html,''))=item->>'reminder_hash') then
   raise exception 'recovery_scope_or_source_drift';
  end if;
 end loop;
 update private.mail_source_recovery_jobs j set state='running',attempts=j.attempts+1,lease_id=gen_random_uuid(),leased_until=clock_timestamp()+interval '3 minutes',updated_at=clock_timestamp() where j.id=job.id returning * into job;
 insert into private.mail_source_recovery_events(job_id,event_type,data) values(job.id,'claimed',jsonb_build_object('lease_id',job.lease_id,'attempt',job.attempts,'executor','server-mail-source-recovery'));
 return jsonb_build_object('id',job.id,'batch_id',job.batch_id,'mailbox_id',job.mailbox_id,'lease_id',job.lease_id,'tasks',job.tasks,'previous_result',job.result);
end $$;
create function public.finish_mail_source_recovery(target_job uuid,target_lease uuid,final_state text,result_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_only';end if;
 if final_state not in('completed','partial','blocked','failed') or jsonb_typeof(result_data)<>'object' or octet_length(result_data::text)>250000
   or result_data::text ~* '"(password|body_text|body_html|sender_email|token|secret|subject)"[[:space:]]*:' then raise exception 'invalid_aggregate_recovery_result';end if;
 update private.mail_source_recovery_jobs set state=final_state,result=result_data,leased_until=null,updated_at=clock_timestamp() where id=target_job and lease_id=target_lease and state='running';
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'stale_recovery_lease';end if;
 insert into private.mail_source_recovery_events(job_id,event_type,data) values(target_job,final_state,result_data);
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
 values(null,'mailbox_connection',(select mailbox_id from private.mail_source_recovery_jobs where id=target_job),'mail_source_recovery_'||final_state,jsonb_build_object('job_id',target_job,'state',final_state,'executor','server-mail-source-recovery','result',result_data),'Project owner authorized exact reminder-based original mailbox and attachment review; server-side maintenance, no impersonated CRM actor, no automated inquiry conversion.');
end $$;
revoke all on function public.claim_mail_source_recovery(),public.finish_mail_source_recovery(uuid,uuid,text,jsonb) from public,anon,authenticated,crm_marketing_readonly;
grant execute on function public.claim_mail_source_recovery(),public.finish_mail_source_recovery(uuid,uuid,text,jsonb) to service_role;

-- Newly recovered unassigned messages stay with the active mailbox owner or
-- owner role until a separately confirmed business registration associates them.
create policy email_messages_source_recovery_scope on public.email_messages as restrictive for select to public
 using(association_method is distinct from 'source_recovery_review' or private.can_read_system_notice(mailbox_connection_id,'system_notice_filter'));
-- Automatic contact/thread matching cannot release a recovered source from
-- review. A separately converted intake must match the actual original source.
create function private.hold_recovered_mail_for_review()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.association_method='source_recovery_review' and not (
  new.inquiry_id is not null and exists(
   select 1 from public.email_intake e where e.inquiry_id=new.inquiry_id and e.processing_status='converted'
    and lower(e.sender_email)=lower(new.sender_email)
    and ((nullif(trim(new.message_id,'<>'),'') is not null and trim(e.message_id,'<>')=trim(new.message_id,'<>'))
      or (e.subject=new.subject and e.body_text=new.body_text))
  )
 ) then
  new.inquiry_id:=old.inquiry_id;new.association_status:='ignored';new.association_method:='source_recovery_review';
 end if;
 return new;
end $$;
revoke all on function private.hold_recovered_mail_for_review() from public,anon,authenticated,crm_marketing_readonly,service_role;
create trigger hold_recovered_mail_for_review before update of inquiry_id,association_status,association_method on public.email_messages
 for each row execute function private.hold_recovered_mail_for_review();
notify pgrst,'reload schema';
commit;
