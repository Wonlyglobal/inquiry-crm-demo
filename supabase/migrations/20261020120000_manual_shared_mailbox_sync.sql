create table if not exists public.mail_sync_manual_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  started_at timestamptz,
  finished_at timestamptz,
  result_code text check (result_code in ('ok','mailbox_unavailable','sync_failed'))
);

create index if not exists mail_sync_manual_requests_pending_idx
  on public.mail_sync_manual_requests(requested_at)
  where status in ('pending','processing');
create index if not exists mail_sync_manual_requests_owner_idx
  on public.mail_sync_manual_requests(requested_by,requested_at desc);

alter table public.mail_sync_manual_requests enable row level security;
revoke all on public.mail_sync_manual_requests from public,anon;
revoke insert,update,delete on public.mail_sync_manual_requests from authenticated;
grant select on public.mail_sync_manual_requests to authenticated;
grant select,insert,update on public.mail_sync_manual_requests to service_role;

drop policy if exists mail_sync_manual_requests_read_own on public.mail_sync_manual_requests;
create policy mail_sync_manual_requests_read_own
  on public.mail_sync_manual_requests for select to authenticated
  using (requested_by=(select auth.uid()));

create or replace function public.request_shared_mail_sync()
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid:=auth.uid();
  request_id uuid;
begin
  if actor_id is null
     or not exists(select 1 from public.profiles p where p.id=actor_id and p.active=true)
     or coalesce(private.current_crm_role()::text,'') not in ('owner','marketing') then
    raise exception '当前账号无权手动拉取公共邮箱';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('shared-mailbox-manual-sync',0));

  select r.id into request_id
  from public.mail_sync_manual_requests r
  where r.requested_by=actor_id
    and r.requested_at>clock_timestamp()-interval '30 seconds'
  order by r.requested_at desc limit 1;
  if request_id is not null then return request_id; end if;

  if exists(select 1 from public.mail_sync_manual_requests r where r.status in ('pending','processing')) then
    raise exception '公共邮箱同步任务正在处理中，请稍后重试';
  end if;

  if not exists(select 1 from public.mailbox_connections c where c.mailbox_kind='shared_inquiry' and c.status='connected' and c.sync_enabled=true) then
    raise exception '公共邮箱当前未连接或同步已停用';
  end if;

  insert into public.mail_sync_manual_requests(requested_by) values(actor_id) returning id into request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data)
  values(actor_id,'system',null,'mail_sync_manual_requested','用户请求手动同步公共询盘邮箱',jsonb_build_object('request_id',request_id,'mailbox_kind','shared_inquiry'));
  return request_id;
end;
$$;
revoke all on function public.request_shared_mail_sync() from public,anon;
grant execute on function public.request_shared_mail_sync() to authenticated;

create or replace function public.claim_shared_mail_sync_request()
returns table(request_id uuid)
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception '仅邮件同步服务可领取手动同步任务'; end if;

  update public.mail_sync_manual_requests r
  set status='failed',finished_at=clock_timestamp(),result_code='sync_failed'
  where r.status in ('pending','processing') and r.requested_at<clock_timestamp()-interval '10 minutes';

  return query
  with next_request as (
    select r.id from public.mail_sync_manual_requests r
    where r.status='pending'
    order by r.requested_at
    for update skip locked
    limit 1
  )
  update public.mail_sync_manual_requests r
  set status='processing',started_at=clock_timestamp(),finished_at=null,result_code=null
  from next_request n
  where r.id=n.id
  returning r.id;
end;
$$;
revoke all on function public.claim_shared_mail_sync_request() from public,anon,authenticated;
grant execute on function public.claim_shared_mail_sync_request() to service_role;

create or replace function public.finish_shared_mail_sync_request(target_request_id uuid,target_status text,target_result_code text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare changed integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception '仅邮件同步服务可完成手动同步任务'; end if;
  if target_status not in ('completed','failed')
     or target_result_code not in ('ok','mailbox_unavailable','sync_failed')
     or (target_status='completed' and target_result_code<>'ok')
     or (target_status='failed' and target_result_code='ok') then
    raise exception '手动同步任务结果无效';
  end if;
  update public.mail_sync_manual_requests
  set status=target_status,result_code=target_result_code,finished_at=clock_timestamp()
  where id=target_request_id and status='processing';
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;
revoke all on function public.finish_shared_mail_sync_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_shared_mail_sync_request(uuid,text,text) to service_role;
