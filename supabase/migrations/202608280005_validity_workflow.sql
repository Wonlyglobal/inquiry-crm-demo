alter table public.inquiries
  add column if not exists invalid_review_status text,
  add column if not exists invalid_requested_by uuid references public.profiles(id),
  add column if not exists invalid_requested_at timestamptz,
  add column if not exists invalid_request_reason text;

alter table public.inquiries drop constraint if exists inquiries_invalid_review_status_check;
alter table public.inquiries add constraint inquiries_invalid_review_status_check
  check (invalid_review_status is null or invalid_review_status in ('pending','approved','rejected'));

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
      or new.won_amount is distinct from old.won_amount
      or new.won_currency is distinct from old.won_currency
      or new.won_exchange_rate is distinct from old.won_exchange_rate
      or new.won_at is distinct from old.won_at
      or new.created_by is distinct from old.created_by
      or new.company_id is distinct from old.company_id
      or new.contact_id is distinct from old.contact_id then
      raise exception '该字段必须通过对应审批流程修改';
    end if;
  elsif actor_role = 'marketing' then
    if new.owner_id is distinct from old.owner_id
      or new.won_amount is distinct from old.won_amount
      or new.won_currency is distinct from old.won_currency
      or new.won_exchange_rate is distinct from old.won_exchange_rate
      or new.won_at is distinct from old.won_at then
      raise exception '市场部无权修改负责人或成交确认字段';
    end if;
  end if;

  if new.validity = 'invalid' and new.status is distinct from old.status then
    raise exception '无效询盘不能继续推进阶段';
  end if;
  if new.status in ('received','qualified','contacted','quoted','sampled','negotiating','won','lost')
    and (new.validity <> 'valid' or new.owner_id is null) then
    raise exception '询盘确认有效并完成分配后才能推进阶段';
  end if;
  if new.status = 'contacted' and new.first_valid_contact_at is null then
    raise exception '完成首次有效联系后才能进入已联系阶段';
  end if;
  if new.status = 'lost' and nullif(trim(new.lost_reason),'') is null then
    raise exception '丢单必须填写原因';
  end if;
  if new.status in ('quoted','sampled','negotiating')
    and (new.estimated_amount is null or nullif(trim(new.currency),'') is null) then
    raise exception '进入报价及后续阶段前必须填写预计金额和币种';
  end if;
  if actor_role = 'sales' and new.status = 'won' and new.status is distinct from old.status then
    raise exception '业务员必须提交成交申请，由主管确认成交';
  end if;
  return new;
end;
$$;

drop trigger if exists inquiries_enforce_update_scope on public.inquiries;
create trigger inquiries_enforce_update_scope
before update on public.inquiries
for each row execute function private.enforce_inquiry_update_scope();

create or replace function public.decide_inquiry_validity(
  target_inquiry_id uuid,
  decision text,
  reason_type text default null,
  reason_detail text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.crm_role := private.current_crm_role();
  item public.inquiries;
  encoded_reason text;
  manager record;
begin
  if decision not in ('valid','invalid','pending') then raise exception '不支持的有效性结果'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;

  if decision='invalid' then
    if nullif(trim(reason_type),'') is null then raise exception '请选择无效原因'; end if;
    if reason_type='other' and nullif(trim(reason_detail),'') is null then raise exception '选择其他原因时必须填写说明'; end if;
    encoded_reason := '['||trim(reason_type)||'] '||coalesce(trim(reason_detail),'');
  end if;

  if actor_role='sales' then
    if item.owner_id is distinct from auth.uid() then raise exception '只能处理本人负责的询盘'; end if;
    if decision <> 'invalid' then raise exception '业务员只能提交无效申请'; end if;
    if nullif(trim(reason_detail),'') is null then raise exception '业务员必须填写核验过程和判定依据'; end if;
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set invalid_review_status='pending',invalid_requested_by=auth.uid(),
      invalid_requested_at=clock_timestamp(),invalid_request_reason=encoded_reason,
      updated_by=auth.uid(),last_change_reason='业务员提交无效申请：'||encoded_reason,updated_at=clock_timestamp()
    where id=target_inquiry_id;
    for manager in select id from public.profiles where role in ('owner','sales_manager') and active loop
      insert into public.notifications(recipient_id,inquiry_id,type,title,body)
      values(manager.id,target_inquiry_id,'invalid_review_requested','业务员提交无效申请',encoded_reason);
    end loop;
    return 'pending_review';
  end if;

  if actor_role not in ('owner','sales_manager','marketing') then raise exception '无权判断询盘有效性'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    validity=decision,
    invalid_reason=case when decision='invalid' then encoded_reason else null end,
    status=case
      when decision='valid' and owner_id is null then 'pending_assignment'::public.inquiry_status
      when decision='invalid' then status
      else status end,
    invalid_review_status=case when decision='invalid' then 'approved' else null end,
    invalid_requested_by=null,invalid_requested_at=null,invalid_request_reason=null,
    updated_by=auth.uid(),last_change_reason=case when decision='valid' then '确认询盘有效'
      when decision='invalid' then '确认询盘无效：'||encoded_reason else '标记为待核实' end,
    updated_at=clock_timestamp()
  where id=target_inquiry_id;
  return decision;
end;
$$;

create or replace function public.review_inquiry_invalid_request(
  target_inquiry_id uuid,
  approve boolean,
  review_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.inquiries;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核无效申请'; end if;
  if nullif(trim(review_reason),'') is null then raise exception '请填写审核原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if item.invalid_review_status is distinct from 'pending' then raise exception '当前没有待审核的无效申请'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    validity=case when approve then 'invalid' else validity end,
    invalid_reason=case when approve then invalid_request_reason else invalid_reason end,
    invalid_review_status=case when approve then 'approved' else 'rejected' end,
    updated_by=auth.uid(),last_change_reason=(case when approve then '通过' else '驳回' end)||'无效申请：'||trim(review_reason),
    updated_at=clock_timestamp()
  where id=target_inquiry_id;
  if item.invalid_requested_by is not null then
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(item.invalid_requested_by,target_inquiry_id,
      case when approve then 'invalid_review_approved' else 'invalid_review_rejected' end,
      case when approve then '无效申请已通过' else '无效申请被驳回' end,trim(review_reason));
  end if;
end;
$$;

revoke all on function public.decide_inquiry_validity(uuid,text,text,text) from public;
revoke all on function public.review_inquiry_invalid_request(uuid,boolean,text) from public;
grant execute on function public.decide_inquiry_validity(uuid,text,text,text) to authenticated;
grant execute on function public.review_inquiry_invalid_request(uuid,boolean,text) to authenticated;

drop policy if exists audit_logs_read_owner_manager on public.audit_logs;
drop policy if exists audit_logs_read_by_crm_scope on public.audit_logs;
create policy audit_logs_read_by_crm_scope on public.audit_logs for select to authenticated
using (
  private.current_crm_role() in ('owner','sales_manager','marketing')
  or (
    private.current_crm_role() = 'sales'
    and entity_type = 'inquiry'
    and exists (
      select 1 from public.inquiries i
      where i.id = audit_logs.entity_id and i.owner_id = auth.uid()
    )
  )
);

create or replace function public.assign_inquiry_to_sales(target_inquiry_id uuid, target_sales_id uuid, change_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_role public.crm_role; intake_id uuid; item public.inquiries;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可分配询盘'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写分配原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if item.validity <> 'valid' then raise exception '只有已确认有效的询盘才能分配'; end if;
  select role into target_role from public.profiles where id=target_sales_id and active;
  if target_role <> 'sales' then raise exception '只能分配给启用中的销售账号'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set owner_id=target_sales_id,status='received',assigned_at=clock_timestamp(),
    first_contact_due_at=clock_timestamp()+interval '30 minutes',updated_by=auth.uid(),
    last_change_reason=change_reason,updated_at=clock_timestamp() where id=target_inquiry_id;
  select id into intake_id from public.email_intake where inquiry_id=target_inquiry_id;
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(target_sales_id,target_inquiry_id,'inquiry_assigned','主管已分配新询盘',change_reason);
  insert into public.integration_events(inquiry_id,email_intake_id,event_type,recipient_profile_id)
  values(target_inquiry_id,intake_id,'notify_sales_assignment',target_sales_id);
end;
$$;

create or replace function public.register_inquiry_for_assignment(target_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare intake_id uuid; manager record; item public.inquiries;
begin
  if private.current_crm_role() not in ('owner','marketing') then raise exception '仅市场部或老板可提交登记'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if item.validity <> 'valid' then raise exception '请先确认询盘有效，再提交主管分配'; end if;
  update public.email_intake set processing_status='registered',registered_at=clock_timestamp(),
    registered_by=auth.uid(),updated_at=clock_timestamp() where inquiry_id=target_inquiry_id returning id into intake_id;
  if intake_id is null then raise exception '该询盘没有关联原始邮件'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set status='pending_assignment',owner_id=null,updated_by=auth.uid(),
    last_change_reason='市场部确认有效并提交主管分配',updated_at=clock_timestamp() where id=target_inquiry_id;
  for manager in select id from public.profiles where role='sales_manager' and active loop
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(manager.id,target_inquiry_id,'assignment_requested','有效询盘待分配','市场部已确认有效并完成登记');
    insert into public.integration_events(inquiry_id,email_intake_id,event_type,recipient_profile_id)
    values(target_inquiry_id,intake_id,'notify_manager_assignment',manager.id);
  end loop;
end;
$$;
