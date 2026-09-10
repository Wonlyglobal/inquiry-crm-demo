-- Sales must submit lost-deal decisions for manager review.

create table if not exists public.inquiry_lost_requests (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  loss_reason text not null check (length(trim(loss_reason))>=4),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index if not exists inquiry_lost_one_pending_idx on public.inquiry_lost_requests(inquiry_id) where status='pending';
create index if not exists inquiry_lost_review_idx on public.inquiry_lost_requests(status,created_at) where status='pending';
alter table public.inquiry_lost_requests enable row level security;
drop policy if exists inquiry_lost_requests_read on public.inquiry_lost_requests;
create policy inquiry_lost_requests_read on public.inquiry_lost_requests for select to authenticated
using (requested_by=(select auth.uid()) or private.current_crm_role() in ('owner','sales_manager'));
grant select on public.inquiry_lost_requests to authenticated;
grant select,insert,update,delete on public.inquiry_lost_requests to service_role;

create or replace function public.request_inquiry_lost(target_inquiry_id uuid,loss_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare item public.inquiries; request_id uuid; manager record;
begin
  if private.current_crm_role()<>'sales' then raise exception '仅业务员可提交丢单申请'; end if;
  if nullif(trim(loss_reason),'') is null or length(trim(loss_reason))<4 then raise exception '请填写完整丢单原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found or item.owner_id is distinct from auth.uid() then raise exception '只能提交本人负责商机的丢单申请'; end if;
  if item.validity<>'valid' or item.status in ('won','lost') then raise exception '当前商机不能提交丢单申请'; end if;
  if exists(select 1 from public.inquiry_lost_requests where inquiry_id=target_inquiry_id and status='pending') then raise exception '该商机已有待审核丢单申请'; end if;
  insert into public.inquiry_lost_requests(inquiry_id,requested_by,loss_reason) values(target_inquiry_id,auth.uid(),trim(loss_reason)) returning id into request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'inquiry',target_inquiry_id,'lost_requested',jsonb_build_object('status',item.status),jsonb_build_object('requested_status','lost','request_id',request_id),trim(loss_reason));
  for manager in select id from public.profiles where role in ('owner','sales_manager') and active loop
    insert into public.notifications(recipient_id,inquiry_id,type,title,body) values(manager.id,target_inquiry_id,'lost_review_requested','丢单申请待审核',trim(loss_reason));
  end loop;
  return request_id;
end $$;

create or replace function public.review_inquiry_lost(target_request_id uuid,approve boolean,review_comment text)
returns void language plpgsql security definer set search_path='' as $$
declare req public.inquiry_lost_requests; item public.inquiries;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核丢单申请'; end if;
  if nullif(trim(review_comment),'') is null then raise exception '请填写审核意见'; end if;
  select * into req from public.inquiry_lost_requests where id=target_request_id for update;
  if not found or req.status<>'pending' then raise exception '当前没有待审核的丢单申请'; end if;
  select * into item from public.inquiries where id=req.inquiry_id for update;
  if approve then
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set status='lost',lost_reason=req.loss_reason,next_follow_up_at=null,updated_by=auth.uid(),last_change_reason='主管确认丢单：'||trim(review_comment),updated_at=clock_timestamp() where id=req.inquiry_id;
  end if;
  update public.inquiry_lost_requests set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),review_note=trim(review_comment),reviewed_at=clock_timestamp(),updated_at=clock_timestamp() where id=req.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'lost_approved' else 'lost_rejected' end,jsonb_build_object('status',item.status,'request_id',req.id),jsonb_build_object('status',case when approve then 'lost' else item.status::text end,'request_id',req.id),trim(review_comment));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'lost_approved' else 'lost_rejected' end,case when approve then '丢单申请已通过' else '丢单申请被驳回' end,trim(review_comment));
end $$;

create or replace function private.require_sales_lost_approval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='lost' and new.status is distinct from old.status and private.current_crm_role()='sales'
    and coalesce(current_setting('app.inquiry_workflow_rpc',true),'')<>'on' then
    raise exception '业务员关闭丢单必须提交主管审核';
  end if;
  return new;
end $$;
drop trigger if exists inquiries_require_sales_lost_approval on public.inquiries;
create trigger inquiries_require_sales_lost_approval before update of status on public.inquiries for each row execute function private.require_sales_lost_approval();

revoke all on function public.request_inquiry_lost(uuid,text) from public,anon;
revoke all on function public.review_inquiry_lost(uuid,boolean,text) from public,anon;
revoke all on function private.require_sales_lost_approval() from public,anon,authenticated;
grant execute on function public.request_inquiry_lost(uuid,text) to authenticated;
grant execute on function public.review_inquiry_lost(uuid,boolean,text) to authenticated;
