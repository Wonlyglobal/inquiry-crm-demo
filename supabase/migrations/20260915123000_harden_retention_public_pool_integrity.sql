-- Keep ownership, retention and public-pool state behind audited workflows,
-- and revalidate retention requests under a consistent inquiry-first lock.

create or replace function private.enforce_inquiry_assignment_and_retention_workflow()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('app.inquiry_workflow_rpc',true),'') <> 'on'
    and (
      new.owner_id is distinct from old.owner_id
      or new.retained_until is distinct from old.retained_until
      or new.public_pool_entered_at is distinct from old.public_pool_entered_at
    ) then
    raise exception '负责人、客户保留期限和公海状态必须通过对应审批流程修改';
  end if;
  return new;
end;
$$;

drop trigger if exists inquiries_enforce_assignment_retention_workflow on public.inquiries;
create trigger inquiries_enforce_assignment_retention_workflow
before update of owner_id,retained_until,public_pool_entered_at on public.inquiries
for each row execute function private.enforce_inquiry_assignment_and_retention_workflow();

revoke all on function private.enforce_inquiry_assignment_and_retention_workflow() from public,anon,authenticated;

create or replace function public.review_inquiry_retention(
  target_request_id uuid,
  approve boolean,
  review_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  req public.inquiry_retention_requests;
  item public.inquiries;
  request_inquiry_id uuid;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核保留申请'; end if;
  if nullif(trim(review_reason),'') is null then raise exception '请填写审核依据'; end if;

  select inquiry_id into request_inquiry_id
  from public.inquiry_retention_requests
  where id=target_request_id;
  if not found then raise exception '当前没有待审核的保留申请'; end if;

  -- Match the public-pool review lock order: inquiry first, request second.
  select * into item from public.inquiries where id=request_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  select * into req from public.inquiry_retention_requests where id=target_request_id for update;
  if not found or req.status<>'pending' then raise exception '当前没有待审核的保留申请'; end if;

  if approve then
    if item.validity<>'valid' or item.status in ('won','lost') then
      raise exception '商机已关闭或不再有效，不能批准保留申请';
    end if;
    if item.owner_id is distinct from req.requested_by or item.public_pool_entered_at is not null then
      raise exception '询盘负责人或公海状态已变化，请由当前负责人重新提交保留申请';
    end if;
    if req.requested_until<=current_date then
      raise exception '申请的保留截止日期已过，请重新提交新的日期';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id=req.requested_by and p.role='sales' and p.active
    ) then
      raise exception '申请人账号已停用或不再是业务员，不能批准保留申请';
    end if;
  end if;

  update public.inquiry_retention_requests
  set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),review_reason=trim(review_reason),reviewed_at=clock_timestamp()
  where id=target_request_id;

  if approve then
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries
    set retained_until=req.requested_until,public_pool_entered_at=null,
      updated_by=auth.uid(),last_change_reason='批准客户保留至'||req.requested_until::text||'：'||trim(review_reason),
      updated_at=clock_timestamp()
    where id=req.inquiry_id;
  end if;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'retention_approved' else 'retention_rejected' end,
    trim(review_reason),jsonb_build_object('retained_until',item.retained_until),
    jsonb_build_object('retained_until',case when approve then req.requested_until else item.retained_until end,'request_id',req.id));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'retention_approved' else 'retention_rejected' end,
    case when approve then '客户保留申请已通过' else '客户保留申请被驳回' end,trim(review_reason));
end;
$$;

revoke all on function public.review_inquiry_retention(uuid,boolean,text) from public,anon;
grant execute on function public.review_inquiry_retention(uuid,boolean,text) to authenticated;
