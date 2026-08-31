-- Keep pipeline and response-SLA timestamps consistent when an inquiry is
-- reassigned directly or assigned again after entering the public pool.
create or replace function private.record_assignment_time()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null
     and current_setting('app.inquiry_workflow_rpc',true) is distinct from 'on' then
    new.assigned_at := clock_timestamp();
  end if;
  if new.status='quoted' and old.status is distinct from new.status and new.quoted_at is null then
    new.quoted_at := clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function private.record_assignment_time() from public;

create or replace function public.assign_inquiry_to_sales(
  target_inquiry_id uuid,
  target_sales_id uuid,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  target_role public.crm_role;
  intake_id uuid;
  item public.inquiries;
  assigned_time timestamptz := clock_timestamp();
  next_status public.inquiry_status;
  is_reassignment boolean;
  reset_response_sla boolean;
  previous_effective_owner uuid;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可分配询盘'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写分配或转派原因'; end if;

  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.validity<>'valid' then raise exception '只有已确认有效的询盘才能分配'; end if;
  if item.status in ('won','lost') then raise exception '已关闭商机不能重新分配'; end if;
  if item.owner_id=target_sales_id then raise exception '该业务员已经是当前负责人'; end if;

  select role into target_role from public.profiles where id=target_sales_id and active;
  if target_role<>'sales' then raise exception '只能分配给启用中的销售账号'; end if;

  previous_effective_owner := item.owner_id;
  if previous_effective_owner is null and item.public_pool_entered_at is not null then
    select h.new_owner_id into previous_effective_owner
    from public.inquiry_assignment_history h
    where h.inquiry_id=target_inquiry_id
    order by h.assigned_at desc limit 1;
  end if;

  is_reassignment := item.owner_id is not null or item.public_pool_entered_at is not null;
  reset_response_sla := item.assigned_at is null or item.first_valid_contact_at is null;
  next_status := case
    when item.status='pending_assignment' then 'received'::public.inquiry_status
    when item.public_pool_entered_at is not null then item.status
    when item.owner_id is null then 'received'::public.inquiry_status
    else item.status
  end;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    owner_id=target_sales_id,
    status=next_status,
    assigned_at=case when reset_response_sla then assigned_time else item.assigned_at end,
    first_contact_due_at=case when reset_response_sla then assigned_time+interval '30 minutes' else item.first_contact_due_at end,
    retained_until=null,
    public_pool_entered_at=null,
    updated_by=auth.uid(),
    last_change_reason=trim(change_reason),
    updated_at=assigned_time
  where id=target_inquiry_id;

  insert into public.inquiry_assignment_history(inquiry_id,previous_owner_id,new_owner_id,assigned_by,reason,stage_at_assignment,is_reassignment,assigned_at)
  values(target_inquiry_id,previous_effective_owner,target_sales_id,auth.uid(),trim(change_reason),next_status,is_reassignment,assigned_time);

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,case when is_reassignment then 'reassignment' else 'assignment' end,trim(change_reason),
    jsonb_build_object('owner_id',previous_effective_owner,'status',item.status,'assigned_at',item.assigned_at,'public_pool_entered_at',item.public_pool_entered_at,'retained_until',item.retained_until),
    jsonb_build_object('owner_id',target_sales_id,'status',next_status,'assigned_at',case when reset_response_sla then assigned_time else item.assigned_at end,'public_pool_entered_at',null,'retained_until',null));

  if is_reassignment and previous_effective_owner is not null and previous_effective_owner<>target_sales_id then
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(previous_effective_owner,target_inquiry_id,'inquiry_reassigned_away','询盘已重新分配给其他业务员',trim(change_reason));
  end if;
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(target_sales_id,target_inquiry_id,case when is_reassignment then 'inquiry_reassigned' else 'inquiry_assigned' end,
    case when is_reassignment then '主管重新分配了一条询盘给你' else '主管已分配新询盘' end,trim(change_reason));

  select id into intake_id from public.email_intake where inquiry_id=target_inquiry_id;
  insert into public.integration_events(inquiry_id,email_intake_id,event_type,recipient_profile_id,payload)
  values(target_inquiry_id,intake_id,'notify_sales_assignment',target_sales_id,
    jsonb_build_object('is_reassignment',is_reassignment,'previous_owner_id',previous_effective_owner,'from_public_pool',item.public_pool_entered_at is not null,'stage',next_status));
end;
$$;

revoke all on function public.assign_inquiry_to_sales(uuid,uuid,text) from public;
grant execute on function public.assign_inquiry_to_sales(uuid,uuid,text) to authenticated;
