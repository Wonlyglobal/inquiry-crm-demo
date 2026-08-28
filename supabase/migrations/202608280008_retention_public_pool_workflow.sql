-- Controlled customer retention, extension approval and public-pool release.

alter table public.inquiries
  add column if not exists retained_until date,
  add column if not exists public_pool_entered_at timestamptz;

create table if not exists public.inquiry_retention_requests (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  requested_until date not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create unique index if not exists inquiry_retention_one_pending_idx
  on public.inquiry_retention_requests(inquiry_id) where status='pending';
create index if not exists inquiry_retention_requests_inquiry_idx
  on public.inquiry_retention_requests(inquiry_id, created_at desc);

alter table public.inquiry_retention_requests enable row level security;
drop policy if exists inquiry_retention_read_scope on public.inquiry_retention_requests;
create policy inquiry_retention_read_scope on public.inquiry_retention_requests for select to authenticated
using (
  private.current_crm_role() in ('owner','sales_manager','marketing')
  or requested_by=auth.uid()
  or exists(select 1 from public.inquiries i where i.id=inquiry_id and i.owner_id=auth.uid())
);
grant select on public.inquiry_retention_requests to authenticated;

create or replace function public.request_inquiry_retention(
  target_inquiry_id uuid,
  requested_until date,
  request_reason text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare item public.inquiries; request_id uuid; manager record;
begin
  if private.current_crm_role()<>'sales' then raise exception '仅当前负责人可提交客户保留申请'; end if;
  if requested_until is null or requested_until<=current_date then raise exception '保留截止日期必须晚于今天'; end if;
  if requested_until>current_date+interval '180 days' then raise exception '单次保留期限不能超过180天'; end if;
  if nullif(trim(request_reason),'') is null then raise exception '请填写申请原因和下一步计划'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.owner_id is distinct from auth.uid() then raise exception '只能申请保留本人负责的客户'; end if;
  if item.validity<>'valid' or item.status in ('won','lost') then raise exception '仅有效且进行中的询盘可以申请保留'; end if;
  if exists(select 1 from public.inquiry_retention_requests where inquiry_id=target_inquiry_id and status='pending') then
    raise exception '该询盘已有待审核的保留申请';
  end if;
  insert into public.inquiry_retention_requests(inquiry_id,requested_by,requested_until,reason)
  values(target_inquiry_id,auth.uid(),requested_until,trim(request_reason)) returning id into request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'retention_requested',trim(request_reason),jsonb_build_object('requested_until',requested_until,'request_id',request_id));
  for manager in select id from public.profiles where role in ('owner','sales_manager') and active loop
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(manager.id,target_inquiry_id,'retention_review_requested','客户保留/延期申请待审核',trim(request_reason));
  end loop;
  return request_id;
end;
$$;

create or replace function public.review_inquiry_retention(
  target_request_id uuid,
  approve boolean,
  review_reason text
)
returns void language plpgsql security definer set search_path='' as $$
declare req public.inquiry_retention_requests; item public.inquiries;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核保留申请'; end if;
  if nullif(trim(review_reason),'') is null then raise exception '请填写审核依据'; end if;
  select * into req from public.inquiry_retention_requests where id=target_request_id for update;
  if not found or req.status<>'pending' then raise exception '当前没有待审核的保留申请'; end if;
  select * into item from public.inquiries where id=req.inquiry_id for update;
  update public.inquiry_retention_requests set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),review_reason=trim(review_reason),reviewed_at=clock_timestamp()
  where id=target_request_id;
  if approve then
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set retained_until=req.requested_until,public_pool_entered_at=null,
      updated_by=auth.uid(),last_change_reason='批准客户保留至'||req.requested_until::text||'：'||trim(review_reason),updated_at=clock_timestamp()
    where id=req.inquiry_id;
  end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'retention_approved' else 'retention_rejected' end,trim(review_reason),
    jsonb_build_object('retained_until',item.retained_until),jsonb_build_object('retained_until',case when approve then req.requested_until else item.retained_until end,'request_id',req.id));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'retention_approved' else 'retention_rejected' end,
    case when approve then '客户保留申请已通过' else '客户保留申请被驳回' end,trim(review_reason));
end;
$$;

create or replace function public.release_inquiry_to_public_pool(target_inquiry_id uuid, release_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.inquiries;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可释放客户到公海'; end if;
  if nullif(trim(release_reason),'') is null then raise exception '请填写释放原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.owner_id is null then raise exception '该询盘当前没有负责人'; end if;
  if item.validity<>'valid' or item.status in ('won','lost') then raise exception '仅有效且进行中的询盘可以释放到公海'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set owner_id=null,retained_until=null,public_pool_entered_at=clock_timestamp(),
    updated_by=auth.uid(),last_change_reason='释放到客户公海：'||trim(release_reason),updated_at=clock_timestamp()
  where id=target_inquiry_id;
  update public.inquiry_retention_requests set status='rejected',reviewed_by=auth.uid(),
    review_reason='客户已释放到公海',reviewed_at=clock_timestamp()
  where inquiry_id=target_inquiry_id and status='pending';
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'released_to_public_pool',trim(release_reason),
    jsonb_build_object('owner_id',item.owner_id,'retained_until',item.retained_until),jsonb_build_object('owner_id',null,'public_pool_entered_at',clock_timestamp()));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(item.owner_id,target_inquiry_id,'released_to_public_pool','客户已释放到公海',trim(release_reason));
end;
$$;

revoke all on function public.request_inquiry_retention(uuid,date,text) from public;
revoke all on function public.review_inquiry_retention(uuid,boolean,text) from public;
revoke all on function public.release_inquiry_to_public_pool(uuid,text) from public;
grant execute on function public.request_inquiry_retention(uuid,date,text) to authenticated;
grant execute on function public.review_inquiry_retention(uuid,boolean,text) to authenticated;
grant execute on function public.release_inquiry_to_public_pool(uuid,text) to authenticated;
