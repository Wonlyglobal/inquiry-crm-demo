-- Sales requests to claim public-pool customers or release owned customers.

create table if not exists public.inquiry_public_pool_requests (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  request_type text not null check (request_type in ('claim','release')),
  reason text not null check (length(trim(reason)) between 4 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inquiry_public_pool_one_pending_actor_idx
  on public.inquiry_public_pool_requests(inquiry_id,requested_by,request_type) where status='pending';
create index if not exists inquiry_public_pool_pending_review_idx
  on public.inquiry_public_pool_requests(status,created_at) where status='pending';
create index if not exists inquiry_public_pool_actor_history_idx
  on public.inquiry_public_pool_requests(requested_by,created_at desc);

alter table public.inquiry_public_pool_requests enable row level security;
drop policy if exists inquiry_public_pool_requests_read on public.inquiry_public_pool_requests;
create policy inquiry_public_pool_requests_read on public.inquiry_public_pool_requests for select to authenticated
using (requested_by=(select auth.uid()) or private.current_crm_role() in ('owner','sales_manager'));
grant select on public.inquiry_public_pool_requests to authenticated;

create or replace function public.request_public_pool_action(target_inquiry_id uuid,action_type text,request_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); item public.inquiries; request_id uuid; manager record;
begin
  if private.current_crm_role()<>'sales' then raise exception '仅业务员可提交公海申请'; end if;
  if action_type not in ('claim','release') then raise exception '不支持的公海申请类型'; end if;
  if nullif(trim(request_reason),'') is null or length(trim(request_reason))<4 then raise exception '请填写申请依据和后续计划'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.validity<>'valid' or item.status in ('won','lost') then raise exception '仅有效且进行中的询盘可提交公海申请'; end if;
  if action_type='claim' and (item.owner_id is not null or item.public_pool_entered_at is null) then raise exception '该客户当前不在公海'; end if;
  if action_type='release' and item.owner_id is distinct from actor_id then raise exception '只能申请释放本人负责的客户'; end if;
  if exists(select 1 from public.inquiry_public_pool_requests r where r.inquiry_id=target_inquiry_id and r.requested_by=actor_id and r.request_type=action_type and r.status='pending') then raise exception '已有同类型待审核申请'; end if;
  insert into public.inquiry_public_pool_requests(inquiry_id,requested_by,request_type,reason)
  values(target_inquiry_id,actor_id,action_type,trim(request_reason)) returning id into request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor_id,'inquiry',target_inquiry_id,case when action_type='claim' then 'public_pool_claim_requested' else 'public_pool_release_requested' end,jsonb_build_object('request_id',request_id,'request_type',action_type),trim(request_reason));
  for manager in select id from public.profiles where role in ('owner','sales_manager') and active loop
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(manager.id,target_inquiry_id,'public_pool_review_requested',case when action_type='claim' then '公海客户领取申请待审核' else '客户释放申请待审核' end,trim(request_reason));
  end loop;
  return request_id;
end $$;

create or replace function public.review_public_pool_action(target_request_id uuid,approve boolean,review_note text)
returns void language plpgsql security definer set search_path='' as $$
declare req public.inquiry_public_pool_requests;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核公海申请'; end if;
  if nullif(trim(review_note),'') is null then raise exception '请填写审核依据'; end if;
  select * into req from public.inquiry_public_pool_requests where id=target_request_id for update;
  if not found or req.status<>'pending' then raise exception '当前没有待审核的公海申请'; end if;
  if approve and req.request_type='claim' then
    perform public.assign_inquiry_to_sales(req.inquiry_id,req.requested_by,'批准公海领取：'||trim(review_note));
  elsif approve and req.request_type='release' then
    perform public.release_inquiry_to_public_pool(req.inquiry_id,'批准业务员释放申请：'||trim(review_note));
  end if;
  update public.inquiry_public_pool_requests set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),review_reason=trim(review_note),reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=target_request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'public_pool_request_approved' else 'public_pool_request_rejected' end,jsonb_build_object('request_id',req.id,'request_type',req.request_type,'requested_by',req.requested_by),trim(review_note));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'public_pool_request_approved' else 'public_pool_request_rejected' end,case when approve then '公海申请已通过' else '公海申请被驳回' end,trim(review_note));
end $$;

revoke all on function public.request_public_pool_action(uuid,text,text) from public,anon;
revoke all on function public.review_public_pool_action(uuid,boolean,text) from public,anon;
grant execute on function public.request_public_pool_action(uuid,text,text) to authenticated;
grant execute on function public.review_public_pool_action(uuid,boolean,text) to authenticated;
grant select,insert,update,delete on public.inquiry_public_pool_requests to service_role;

