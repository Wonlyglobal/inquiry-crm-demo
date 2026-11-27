begin;
-- Historical evidence lives apart from email_messages: its notification, SLA,
-- quotation and AI triggers must never run for a historical backfill.
create table public.inquiry_mail_history (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.inquiries(id),
 mailbox_connection_id uuid not null references public.mailbox_connections(id),
 mailbox_owner_id uuid not null references public.profiles(id),
 folder text not null,uid_validity text not null,uid bigint not null check(uid>0),
 message_id text,in_reply_to text,reference_ids text[] not null default '{}',
 direction text not null check(direction in ('inbound','outbound')),
 sender_email text not null,recipient_emails text[] not null default '{}',subject text not null default '',
 sent_at timestamptz,received_at timestamptz,event_at timestamptz not null,
 body_text text not null default '' check(length(body_text)<=65536),body_truncated boolean not null default false,body_status text not null default 'complete' check(body_status in ('complete','truncated','unavailable')), 
 captured_at timestamptz not null default clock_timestamp(),run_id uuid not null,
 check((direction='outbound' and sent_at is not null) or (direction='inbound' and received_at is not null)),
 unique(mailbox_connection_id,folder,uid_validity,uid)
);
create index inquiry_mail_history_inquiry_time on public.inquiry_mail_history(inquiry_id,event_at,id);
alter table public.inquiry_mail_history enable row level security;
revoke all on public.inquiry_mail_history from public,anon,authenticated,service_role;
grant select on public.inquiry_mail_history to service_role;
-- Resolve merges without rewriting stored evidence. A former owner does not
-- retain access when the canonical inquiry is transferred to another owner.
create function private.visible_mail_history_inquiry(target_id uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; root uuid:=target_id; next_id uuid; hops integer:=0; item public.inquiries;
begin
 select * into actor from public.profiles where id=auth.uid() and active and not coalesce(is_test_data,false) and coalesce(data_environment,'production')='production';
 if actor.id is null or coalesce(actor.role::text,'') not in ('owner','sales_manager','sales') or coalesce(auth.jwt()->>'role','')='crm_marketing_readonly' or coalesce((auth.jwt()->'app_metadata'->>'crm_read_only')::boolean,false) then return null;end if;
 loop
  select * into item from public.inquiries where id=root;
  if item.id is null then return null;end if;
  next_id:=item.merged_into_id;
  exit when next_id is null;
  hops:=hops+1;if hops>20 or next_id=root then return null;end if;root:=next_id;
 end loop;
 if item.owner_id is null or item.archived_at is not null or coalesce(item.is_test_data,false) or coalesce(item.excluded_from_dashboard,false) or coalesce(item.data_environment,'production')<>'production' then return null;end if;
 if actor.role::text='owner' or item.owner_id=actor.id or (actor.role::text='sales_manager' and private.crm_manager_covers_inquiry(actor.id,item.id)) then return root;end if;
 return null;
end $$;
revoke all on function private.visible_mail_history_inquiry(uuid) from public,anon,service_role;
grant execute on function private.visible_mail_history_inquiry(uuid) to authenticated;
create policy inquiry_mail_history_read on public.inquiry_mail_history for select to authenticated using(private.visible_mail_history_inquiry(inquiry_id) is not null);
-- Body reads are only available through the scoped, audited RPC.
grant select(id,inquiry_id,mailbox_connection_id,mailbox_owner_id,folder,uid_validity,uid,message_id,in_reply_to,reference_ids,direction,sender_email,recipient_emails,subject,sent_at,received_at,event_at,body_truncated,body_status,captured_at,run_id) on public.inquiry_mail_history to authenticated;
create function public.get_inquiry_mail_history(target_ids uuid[],include_body boolean default false,page_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; records jsonb; more boolean; page_limit integer:=case when include_body then 25 else 500 end;
begin
 select * into actor from public.profiles where id=auth.uid() and active and not coalesce(is_test_data,false) and coalesce(data_environment,'production')='production';
 if actor.id is null or coalesce(actor.role::text,'') not in ('owner','sales_manager','sales') or coalesce(auth.jwt()->>'role','')='crm_marketing_readonly' or coalesce((auth.jwt()->'app_metadata'->>'crm_read_only')::boolean,false) then raise exception '当前账号不能读取业务员私有邮件记录';end if;
 if target_ids is null or cardinality(target_ids) not between 1 and 100 or include_body is null or (include_body and cardinality(target_ids)<>1) or page_offset is null or page_offset<0 or page_offset>100000 or page_offset%page_limit<>0 then raise exception '查询或分页参数无效';end if;
 if include_body and private.visible_mail_history_inquiry(target_ids[1]) is distinct from target_ids[1] then raise exception 'inquiry_scope_denied';end if;
 with roots as materialized(select original_id,private.visible_mail_history_inquiry(original_id) canonical_id from (select distinct inquiry_id original_id from public.inquiry_mail_history) originals), chosen as (select h.*,r.canonical_id from public.inquiry_mail_history h join roots r on r.original_id=h.inquiry_id where r.canonical_id=any(target_ids) order by h.event_at desc,h.id desc limit page_limit+1 offset page_offset), numbered as (select *,row_number() over(order by event_at desc,id desc) pos from chosen)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'inquiry_id',canonical_id,'mailbox_connection_id',mailbox_connection_id,'mailbox_owner_id',mailbox_owner_id,'message_id',message_id,'in_reply_to',in_reply_to,'reference_ids',reference_ids,'direction',direction,'folder',folder,'sender_email',sender_email,'recipient_emails',recipient_emails,'subject',subject,'sent_at',sent_at,'received_at',received_at,'event_at',event_at,'body_truncated',body_truncated,'body_status',body_status,'association_status','matched','historical',true)||case when include_body then jsonb_build_object('body_text',body_text) else '{}'::jsonb end order by pos) filter(where pos<=page_limit),'[]'),coalesce(bool_or(pos>page_limit),false) into records,more from numbered;
 if include_body then insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data) values(actor.id,'inquiry',target_ids[1],'inquiry_mail_history_viewed','查看已授权询盘历史邮件沟通记录',jsonb_build_object('offset',page_offset,'count',jsonb_array_length(records)));end if;
 return jsonb_build_object('items',records,'has_more',more,'limit',page_limit,'as_of',clock_timestamp());
end $$;
revoke all on function public.get_inquiry_mail_history(uuid[],boolean,integer) from public,anon,service_role;
grant execute on function public.get_inquiry_mail_history(uuid[],boolean,integer) to authenticated;
create table private.inquiry_mail_history_requests (
 id uuid primary key,requested_by uuid not null references public.profiles(id),inquiry_id uuid not null references public.inquiries(id),
 owner_id uuid not null references public.profiles(id),requested_at timestamptz not null default clock_timestamp(),
 day date not null default ((clock_timestamp() at time zone 'UTC')::date),
 window_from timestamptz not null,window_to timestamptz not null,
 unique(requested_by,inquiry_id,owner_id,day),unique(id,inquiry_id,owner_id)
);
create table private.inquiry_mail_history_jobs (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references private.inquiry_mail_history_requests(id),
 connection_id uuid not null references public.mailbox_connections(id),status text not null default 'queued' check(status in ('queued','running','completed','partial','failed','cancelled')),
 cursor jsonb not null default '{}',counts jsonb not null default '{}',
 lease_token uuid,lease_until timestamptz,attempts integer not null default 0,error_code text,
 unique(request_id,connection_id)
);
alter table public.inquiry_mail_history add constraint inquiry_mail_history_request_scope foreign key(run_id,inquiry_id,mailbox_owner_id) references private.inquiry_mail_history_requests(id,inquiry_id,owner_id);
alter table public.inquiry_mail_history add constraint inquiry_mail_history_job_scope foreign key(run_id,mailbox_connection_id) references private.inquiry_mail_history_jobs(request_id,connection_id);
revoke all on private.inquiry_mail_history_requests,private.inquiry_mail_history_jobs from public,anon,authenticated,service_role;
create function public.start_inquiry_mail_history(actor_id uuid,target_id uuid,request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; item public.inquiries; existing uuid; request_id uuid; box_count integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service worker required';end if;
 select * into actor from public.profiles where id=actor_id and active and not coalesce(is_test_data,false) and coalesce(data_environment,'production')='production';
 select * into item from public.inquiries where id=target_id and archived_at is null and merged_into_id is null and not coalesce(is_test_data,false) and not coalesce(excluded_from_dashboard,false) and coalesce(data_environment,'production')='production';
 if actor.id is null or coalesce(actor.role::text,'') not in ('owner','sales_manager','sales') or item.owner_id is null or not(actor.role::text='owner' or item.owner_id=actor.id or (actor.role::text='sales_manager' and private.crm_manager_covers_inquiry(actor.id,item.id))) then raise exception 'inquiry_scope_denied';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('history-start:'||actor_id::text,0));
 select id into existing from private.inquiry_mail_history_requests where requested_by=actor_id and inquiry_id=target_id and owner_id=item.owner_id and day=(clock_timestamp() at time zone 'UTC')::date;
 if existing is not null then return existing;end if;
 select count(*) into box_count from public.mailbox_connections where user_id=item.owner_id and mailbox_kind='personal' and status='connected' and sync_enabled;
 if box_count=0 then raise exception 'no_connected_personal_mailbox';end if;
 if (select count(*) from private.inquiry_mail_history_requests where requested_by=actor_id and requested_at>clock_timestamp()-interval '1 hour')>=100 then raise exception 'history_rate_limit';end if;
 insert into private.inquiry_mail_history_requests(id,requested_by,inquiry_id,owner_id,window_from,window_to) values(request_key,actor_id,target_id,item.owner_id,clock_timestamp()-interval '90 days',clock_timestamp()) on conflict(requested_by,inquiry_id,owner_id,day) do nothing returning id into request_id;
 if request_id is null then select id into request_id from private.inquiry_mail_history_requests where requested_by=actor_id and inquiry_id=target_id and owner_id=item.owner_id and day=(clock_timestamp() at time zone 'UTC')::date;return request_id;end if;
 insert into private.inquiry_mail_history_jobs(request_id,connection_id) select request_id,id from public.mailbox_connections where user_id=item.owner_id and mailbox_kind='personal' and status='connected' and sync_enabled;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data) values(actor_id,'inquiry',target_id,'inquiry_mail_history_requested','打开询盘后按项目负责人授权的90天规则自动申请回补，不发信、不产生旧信提醒',jsonb_build_object('request_id',request_id,'mailboxes',box_count,'days',90));
 return request_id;
end $$;
create function public.claim_inquiry_mail_history(actor_id uuid,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare request private.inquiry_mail_history_requests; actor public.profiles; item public.inquiries; job private.inquiry_mail_history_jobs; lease uuid:=gen_random_uuid();
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service worker required';end if;
 select * into request from private.inquiry_mail_history_requests where id=request_key and requested_by=actor_id;
 select * into actor from public.profiles where id=actor_id and active and not coalesce(is_test_data,false) and coalesce(data_environment,'production')='production';
 select * into item from public.inquiries where id=request.inquiry_id and archived_at is null and merged_into_id is null and not coalesce(is_test_data,false) and not coalesce(excluded_from_dashboard,false) and coalesce(data_environment,'production')='production';
 if request.id is null or actor.id is null or coalesce(actor.role::text,'') not in ('owner','sales_manager','sales') or item.id is null or item.owner_id is distinct from request.owner_id or not(actor.role::text='owner' or item.owner_id=actor.id or (actor.role::text='sales_manager' and private.crm_manager_covers_inquiry(actor.id,item.id))) then raise exception 'history_scope_changed';end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('history-actor:'||actor_id::text,0)) then return '{"done":false,"busy":true}'::jsonb;end if;
 if (select count(*) from private.inquiry_mail_history_jobs j join private.inquiry_mail_history_requests r on r.id=j.request_id where r.requested_by=actor_id and j.status='running' and j.lease_until>clock_timestamp())>=2 then return '{"done":false,"busy":true}'::jsonb;end if;
 select j.* into job from private.inquiry_mail_history_jobs j where j.request_id=request_key and (j.status='queued' or j.status='running' and j.lease_until<clock_timestamp()) and j.attempts<500 and not exists(select 1 from private.inquiry_mail_history_jobs other_job where other_job.connection_id=j.connection_id and other_job.status='running' and other_job.lease_until>clock_timestamp()) order by j.id for update skip locked limit 1;
 if job.id is not null and (not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('history-connection:'||job.connection_id::text,0)) or exists(select 1 from private.inquiry_mail_history_jobs j where j.connection_id=job.connection_id and j.status='running' and j.lease_until>clock_timestamp())) then return '{"done":false,"busy":true}'::jsonb;end if;
 if job.id is null then return jsonb_build_object('done',not exists(select 1 from private.inquiry_mail_history_jobs where request_id=request_key and status in ('queued','running')),'jobs',(select coalesce(jsonb_agg(jsonb_build_object('status',status,'counts',counts,'error_code',error_code)),'[]') from private.inquiry_mail_history_jobs where request_id=request_key));end if;
 update private.inquiry_mail_history_jobs set status='running',lease_token=lease,lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1 where id=job.id;
 return jsonb_build_object('done',false,'job',to_jsonb(job)||jsonb_build_object('lease_token',lease),'inquiry_id',request.inquiry_id,'owner_id',request.owner_id,'window_from',request.window_from,'window_to',request.window_to);
end $$;
create function public.finish_inquiry_mail_history(job_key uuid,lease_key uuid,new_status text,new_cursor jsonb,new_counts jsonb,failure_code text default null) returns void language plpgsql security definer set search_path='' as $$
declare request private.inquiry_mail_history_requests;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service worker required';end if;
 if new_status not in ('queued','completed','partial','failed','cancelled') or new_cursor is null or octet_length(new_cursor::text)>250000 or octet_length(new_counts::text)>2000 or failure_code is not null and failure_code not in ('mailbox_unavailable','imap_unavailable','read_failed','scope_changed','scan_limit','no_thread_anchor') then raise exception 'invalid_history_result';end if;
 update private.inquiry_mail_history_jobs set status=new_status,cursor=new_cursor,counts=new_counts,error_code=failure_code,lease_until=null where id=job_key and lease_token=lease_key and status='running' and lease_until>=clock_timestamp();
 if not found then raise exception 'history_lease_expired';end if;
 if new_status in ('completed','partial','failed','cancelled') then
  select r.* into request from private.inquiry_mail_history_requests r join private.inquiry_mail_history_jobs j on j.request_id=r.id where j.id=job_key;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data) values(request.requested_by,'inquiry',request.inquiry_id,'inquiry_mail_history_'||new_status,'历史邮件回补结果；原邮件、阶段、待办和发送均不修改',jsonb_build_object('request_id',request.id,'job_id',job_key,'counts',new_counts,'error_code',failure_code));
 end if;
end $$;
revoke all on function public.start_inquiry_mail_history(uuid,uuid,uuid),public.claim_inquiry_mail_history(uuid,uuid),public.finish_inquiry_mail_history(uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.start_inquiry_mail_history(uuid,uuid,uuid),public.claim_inquiry_mail_history(uuid,uuid),public.finish_inquiry_mail_history(uuid,uuid,text,jsonb,jsonb,text) to service_role;

create function public.next_inquiry_mail_history_request() returns jsonb language plpgsql security definer set search_path='' as $$
declare invalid record; selected record;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service worker required';end if;
 for invalid in select j.id,j.attempts,r.inquiry_id,r.id request_id from private.inquiry_mail_history_jobs j join private.inquiry_mail_history_requests r on r.id=j.request_id left join public.profiles p on p.id=r.requested_by left join public.inquiries i on i.id=r.inquiry_id where j.status in ('queued','running') and (j.attempts>=500 or p.id is null or not p.active or coalesce(p.is_test_data,false) or coalesce(p.data_environment,'production')<>'production' or coalesce(p.role::text,'') not in ('owner','sales_manager','sales') or i.id is null or i.owner_id is distinct from r.owner_id or i.archived_at is not null or i.merged_into_id is not null or coalesce(i.is_test_data,false) or coalesce(i.excluded_from_dashboard,false) or coalesce(i.data_environment,'production')<>'production' or not(p.role::text='owner' or i.owner_id=p.id or p.role::text='sales_manager' and private.crm_manager_covers_inquiry(p.id,i.id))) loop
  update private.inquiry_mail_history_jobs set status=case when invalid.attempts>=500 then 'partial' else 'cancelled' end,lease_until=null,error_code=case when invalid.attempts>=500 then 'scan_limit' else 'scope_changed' end where id=invalid.id;
  insert into public.audit_logs(entity_type,entity_id,action,reason,after_data) values('inquiry',invalid.inquiry_id,'inquiry_mail_history_cancelled','后台回补因当前权限或负责人变化而停止，不修改客户数据',jsonb_build_object('job_id',invalid.id,'request_id',invalid.request_id,'executor','scheduled-worker'));
 end loop;
 select r.id,r.requested_by into selected from private.inquiry_mail_history_requests r join private.inquiry_mail_history_jobs j on j.request_id=r.id where j.status='queued' or j.status='running' and j.lease_until<clock_timestamp() order by r.requested_at,j.id limit 1;
 if selected.id is null then return '{}'::jsonb;end if;
 return jsonb_build_object('request_id',selected.id,'actor_id',selected.requested_by);
end $$;
revoke all on function public.next_inquiry_mail_history_request() from public,anon,authenticated;
grant execute on function public.next_inquiry_mail_history_request() to service_role;

create function public.append_inquiry_mail_history(job_key uuid,lease_key uuid,message_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare job private.inquiry_mail_history_jobs; request private.inquiry_mail_history_requests; actor public.profiles; item public.inquiries; inserted uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service worker required';end if;
 select * into job from private.inquiry_mail_history_jobs where id=job_key and lease_token=lease_key and status='running' and lease_until>=clock_timestamp() for update;
 select * into request from private.inquiry_mail_history_requests where id=job.request_id;
 select * into actor from public.profiles where id=request.requested_by and active and not coalesce(is_test_data,false) and coalesce(data_environment,'production')='production' for share;
 select * into item from public.inquiries where id=request.inquiry_id and archived_at is null and merged_into_id is null and not coalesce(is_test_data,false) and not coalesce(excluded_from_dashboard,false) and coalesce(data_environment,'production')='production' for share;
 if job.id is null or actor.id is null or coalesce(actor.role::text,'') not in ('owner','sales_manager','sales') or item.id is null or item.owner_id is distinct from request.owner_id or not(actor.role::text='owner' or item.owner_id=actor.id or actor.role::text='sales_manager' and private.crm_manager_covers_inquiry(actor.id,item.id)) then raise exception 'history_scope_changed';end if;
 if not exists(select 1 from public.mailbox_connections c where c.id=job.connection_id and c.user_id=request.owner_id and c.mailbox_kind='personal' and c.status='connected' and c.sync_enabled) then raise exception 'mailbox_unavailable';end if;
 if message_data is null or octet_length(message_data::text)>300000 or (message_data->>'event_at')::timestamptz not between request.window_from and request.window_to then raise exception 'invalid_history_message';end if;
 insert into public.inquiry_mail_history(inquiry_id,mailbox_connection_id,mailbox_owner_id,folder,uid_validity,uid,message_id,in_reply_to,reference_ids,direction,sender_email,recipient_emails,subject,sent_at,received_at,event_at,body_text,body_truncated,body_status,run_id)
 values(request.inquiry_id,job.connection_id,request.owner_id,message_data->>'folder',message_data->>'uid_validity',(message_data->>'uid')::bigint,message_data->>'message_id',message_data->>'in_reply_to',array(select jsonb_array_elements_text(coalesce(message_data->'reference_ids','[]'))),message_data->>'direction',message_data->>'sender_email',array(select jsonb_array_elements_text(coalesce(message_data->'recipient_emails','[]'))),coalesce(message_data->>'subject',''),case when message_data->>'direction'='outbound' then (message_data->>'event_at')::timestamptz end,case when message_data->>'direction'='inbound' then (message_data->>'event_at')::timestamptz end,(message_data->>'event_at')::timestamptz,coalesce(message_data->>'body_text',''),coalesce((message_data->>'body_truncated')::boolean,false),message_data->>'body_status',request.id)
 on conflict(mailbox_connection_id,folder,uid_validity,uid) do nothing returning id into inserted;
 if inserted is not null then insert into public.audit_logs(entity_type,entity_id,action,reason,after_data) values('inquiry',item.id,'inquiry_mail_history_captured','维护程序按已授权90天任务追加历史证据，不产生旧信待办',jsonb_build_object('message_id',inserted,'request_id',request.id,'authorized_by',request.requested_by,'executor','history-worker'));end if;
 return inserted;
end $$;
revoke all on function public.append_inquiry_mail_history(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.append_inquiry_mail_history(uuid,uuid,jsonb) to service_role;
commit;
