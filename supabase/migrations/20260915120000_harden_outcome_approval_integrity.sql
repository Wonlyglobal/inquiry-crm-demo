-- Require all won/lost transitions to use the audited approval workflows and
-- revalidate stale requests at the moment a manager reviews them.

create or replace function private.enforce_inquiry_update_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.crm_role := private.current_crm_role();
  rpc_change boolean := coalesce(current_setting('app.inquiry_workflow_rpc', true), '') = 'on';
begin
  if not rpc_change and new.status is distinct from old.status
    and new.status in ('won','lost') then
    raise exception '成交或丢单必须通过申请与主管审批流程';
  end if;
  if not rpc_change and (
    new.won_amount is distinct from old.won_amount
    or new.won_currency is distinct from old.won_currency
    or new.won_exchange_rate is distinct from old.won_exchange_rate
    or new.won_at is distinct from old.won_at
  ) then
    raise exception '成交金额、币种、汇率和成交时间必须通过审批流程修改';
  end if;
  if rpc_change then return new; end if;

  if actor_role = 'sales' then
    if old.owner_id is distinct from auth.uid() then
      raise exception '只能修改本人负责的询盘';
    end if;
    if new.owner_id is distinct from old.owner_id
      or new.validity is distinct from old.validity
      or new.invalid_reason is distinct from old.invalid_reason
      or new.invalid_review_status is distinct from old.invalid_review_status
      or new.invalid_requested_by is distinct from old.invalid_requested_by
      or new.invalid_requested_at is distinct from old.invalid_requested_at
      or new.invalid_request_reason is distinct from old.invalid_request_reason
      or new.created_by is distinct from old.created_by
      or new.company_id is distinct from old.company_id
      or new.contact_id is distinct from old.contact_id then
      raise exception '该字段必须通过对应审批流程修改';
    end if;
  elsif actor_role = 'marketing' then
    if new.owner_id is distinct from old.owner_id then
      raise exception '市场部无权修改负责人或成交确认字段';
    end if;
  end if;

  if new.validity = 'invalid' and new.status is distinct from old.status then
    raise exception '无效询盘不能继续推进阶段';
  end if;
  if new.status in ('received','qualified','contacted','quoted','sample_sent','negotiating','won','lost')
    and (new.validity <> 'valid' or new.owner_id is null) then
    raise exception '询盘确认有效并完成分配后才能推进阶段';
  end if;
  if new.status = 'contacted' and new.first_valid_contact_at is null then
    raise exception '完成首次有效联系后才能进入已联系阶段';
  end if;
  if new.status = 'lost' and nullif(trim(new.lost_reason),'') is null then
    raise exception '丢单必须填写原因';
  end if;
  if new.status in ('quoted','sample_sent','negotiating')
    and (new.estimated_amount is null or nullif(trim(new.currency),'') is null) then
    raise exception '进入报价及后续阶段前必须填写预计金额和币种';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_inquiry_update_scope() from public,anon,authenticated;

create or replace function public.request_inquiry_won(
  target_inquiry_id uuid,
  amount numeric,
  currency text,
  evidence_path text,
  evidence_name text,
  request_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.inquiries;
  request_id uuid;
  normalized_currency text := upper(trim(currency));
  manager record;
begin
  if private.current_crm_role() <> 'sales' then raise exception '仅业务员可提交成交申请'; end if;
  if amount is null or amount <= 0 then raise exception '成交金额必须大于 0'; end if;
  if normalized_currency !~ '^[A-Z]{3}$' then raise exception '成交币种必须为三位代码'; end if;
  if nullif(trim(request_reason),'') is null then raise exception '请填写成交申请说明'; end if;

  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found or item.owner_id is distinct from auth.uid() then raise exception '只能提交本人负责商机的成交申请'; end if;
  if item.validity <> 'valid' or item.status in ('won','lost') then raise exception '当前商机不能提交成交申请'; end if;
  if item.status not in ('quoted','sample_sent','negotiating') then
    raise exception '成交申请前必须完成报价审批并发送客户';
  end if;
  if not exists (
    select 1 from public.quotation_versions q
    where q.inquiry_id=target_inquiry_id and q.status='sent' and q.sent_at is not null
  ) then
    raise exception '成交申请前必须存在已审批并发送客户的报价';
  end if;
  if evidence_path not like target_inquiry_id::text||'/'||auth.uid()::text||'/%' then raise exception '成交凭证路径与申请人不匹配'; end if;
  if not exists(select 1 from storage.objects where bucket_id='research-attachments' and name=evidence_path) then raise exception '成交凭证文件不存在'; end if;
  if exists(select 1 from public.inquiry_won_requests where inquiry_id=target_inquiry_id and status='pending') then raise exception '该商机已有待审核成交申请'; end if;

  insert into public.inquiry_won_requests(inquiry_id,requested_by,won_amount,won_currency,evidence_path,evidence_name,request_reason)
  values(target_inquiry_id,auth.uid(),amount,normalized_currency,evidence_path,trim(evidence_name),trim(request_reason))
  returning id into request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'inquiry',target_inquiry_id,'won_requested',jsonb_build_object('status',item.status),jsonb_build_object('requested_status','won','request_id',request_id,'won_amount',amount,'won_currency',normalized_currency,'evidence_path',evidence_path,'evidence_name',trim(evidence_name)),trim(request_reason));
  for manager in select id from public.profiles where role in ('owner','sales_manager') and active loop
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(manager.id,target_inquiry_id,'won_approval_requested','新的成交申请待审核',normalized_currency||' '||amount::text||' · '||trim(request_reason));
  end loop;
  return request_id;
end;
$$;

create or replace function public.review_inquiry_won(target_request_id uuid,approve boolean,review_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.inquiry_won_requests;
  item public.inquiries;
  locked_rate numeric;
  locked_at timestamptz := clock_timestamp();
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核成交申请'; end if;
  if nullif(trim(review_comment),'') is null then raise exception '请填写审核意见'; end if;
  select * into req from public.inquiry_won_requests where id=target_request_id for update;
  if not found or req.status <> 'pending' then raise exception '当前没有待审核的成交申请'; end if;
  select * into item from public.inquiries where id=req.inquiry_id for update;

  if approve then
    if item.validity <> 'valid' or item.status in ('won','lost') then raise exception '商机已关闭或不再有效，不能审批该成交申请'; end if;
    if item.owner_id is distinct from req.requested_by then raise exception '询盘负责人已变化，请由当前负责人重新提交成交申请'; end if;
    if item.status not in ('quoted','sample_sent','negotiating') or not exists (
      select 1 from public.quotation_versions q
      where q.inquiry_id=req.inquiry_id and q.status='sent' and q.sent_at is not null
    ) then raise exception '报价流程不完整，不能确认成交'; end if;
    if not exists(select 1 from storage.objects where bucket_id=req.evidence_bucket and name=req.evidence_path) then raise exception '成交凭证文件已不存在'; end if;
    if req.won_currency='CNY' then
      locked_rate:=1;
    else
      select rate into locked_rate from public.exchange_rates
      where base_currency=req.won_currency and quote_currency='CNY'
      order by rate_date desc limit 1;
    end if;
    if locked_rate is null or locked_rate<=0 then raise exception '缺少该币种兑人民币汇率'; end if;
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set status='won',won_amount=req.won_amount,won_currency=req.won_currency,
      won_exchange_rate=locked_rate,won_at=locked_at,next_follow_up_at=null,updated_by=auth.uid(),
      last_change_reason='主管确认成交：'||trim(review_comment),updated_at=locked_at
    where id=req.inquiry_id;
  end if;
  update public.inquiry_won_requests set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),review_note=trim(review_comment),reviewed_at=locked_at,
    locked_exchange_rate=case when approve then locked_rate else null end,updated_at=locked_at
  where id=req.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'won_approved' else 'won_rejected' end,
    jsonb_build_object('status',item.status,'request_id',req.id),
    jsonb_build_object('status',case when approve then 'won' else item.status::text end,'request_id',req.id,'won_amount',req.won_amount,'won_currency',req.won_currency,'evidence_reviewed',approve),trim(review_comment));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'won_approval_approved' else 'won_approval_rejected' end,
    case when approve then '成交申请已通过' else '成交申请被驳回' end,trim(review_comment));
end;
$$;

create or replace function public.review_inquiry_lost(target_request_id uuid,approve boolean,review_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.inquiry_lost_requests;
  item public.inquiries;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核丢单申请'; end if;
  if nullif(trim(review_comment),'') is null then raise exception '请填写审核意见'; end if;
  select * into req from public.inquiry_lost_requests where id=target_request_id for update;
  if not found or req.status <> 'pending' then raise exception '当前没有待审核的丢单申请'; end if;
  select * into item from public.inquiries where id=req.inquiry_id for update;

  if approve then
    if item.validity <> 'valid' or item.status in ('won','lost') then raise exception '商机已关闭或不再有效，不能审批该丢单申请'; end if;
    if item.owner_id is distinct from req.requested_by then raise exception '询盘负责人已变化，请由当前负责人重新提交丢单申请'; end if;
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set status='lost',lost_reason=req.loss_reason,next_follow_up_at=null,
      updated_by=auth.uid(),last_change_reason='主管确认丢单：'||trim(review_comment),updated_at=clock_timestamp()
    where id=req.inquiry_id;
  end if;
  update public.inquiry_lost_requests set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),review_note=trim(review_comment),reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=req.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'lost_approved' else 'lost_rejected' end,
    jsonb_build_object('status',item.status,'request_id',req.id),
    jsonb_build_object('status',case when approve then 'lost' else item.status::text end,'request_id',req.id),trim(review_comment));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'lost_approved' else 'lost_rejected' end,
    case when approve then '丢单申请已通过' else '丢单申请被驳回' end,trim(review_comment));
end;
$$;

revoke all on function public.request_inquiry_won(uuid,numeric,text,text,text,text) from public,anon;
revoke all on function public.review_inquiry_won(uuid,boolean,text) from public,anon;
revoke all on function public.review_inquiry_lost(uuid,boolean,text) from public,anon;
grant execute on function public.request_inquiry_won(uuid,numeric,text,text,text,text) to authenticated;
grant execute on function public.review_inquiry_won(uuid,boolean,text) to authenticated;
grant execute on function public.review_inquiry_lost(uuid,boolean,text) to authenticated;
