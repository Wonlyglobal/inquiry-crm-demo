-- Preserve pipeline progress and make every assignment/reassignment attributable.

create table if not exists public.inquiry_assignment_history (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  previous_owner_id uuid references public.profiles(id),
  new_owner_id uuid not null references public.profiles(id),
  assigned_by uuid not null references public.profiles(id),
  reason text not null,
  stage_at_assignment public.inquiry_status not null,
  is_reassignment boolean not null default false,
  assigned_at timestamptz not null default clock_timestamp()
);

create index if not exists inquiry_assignment_history_inquiry_idx on public.inquiry_assignment_history(inquiry_id, assigned_at desc);
create index if not exists inquiry_assignment_history_owner_idx on public.inquiry_assignment_history(new_owner_id, assigned_at desc);

alter table public.inquiry_assignment_history enable row level security;
drop policy if exists assignment_history_read_scope on public.inquiry_assignment_history;
create policy assignment_history_read_scope on public.inquiry_assignment_history for select to authenticated
using (private.current_crm_role() in ('owner','sales_manager','marketing') or new_owner_id=auth.uid() or previous_owner_id=auth.uid());
grant select on public.inquiry_assignment_history to authenticated;

create or replace function public.assign_inquiry_to_sales(target_inquiry_id uuid, target_sales_id uuid, change_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_role public.crm_role; intake_id uuid; item public.inquiries;
  assigned_time timestamptz := clock_timestamp(); next_status public.inquiry_status;
  is_reassignment boolean; reset_response_sla boolean;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可分配询盘'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写分配或转派原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.validity <> 'valid' then raise exception '只有已确认有效的询盘才能分配'; end if;
  if item.owner_id = target_sales_id then raise exception '该业务员已经是当前负责人'; end if;
  select role into target_role from public.profiles where id=target_sales_id and active;
  if target_role <> 'sales' then raise exception '只能分配给启用中的销售账号'; end if;

  is_reassignment := item.owner_id is not null;
  reset_response_sla := item.owner_id is null or item.first_valid_contact_at is null;
  next_status := case when item.owner_id is null or item.status='pending_assignment' then 'received'::public.inquiry_status else item.status end;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set owner_id=target_sales_id,status=next_status,
    assigned_at=case when reset_response_sla then assigned_time else item.assigned_at end,
    first_contact_due_at=case when reset_response_sla then assigned_time+interval '30 minutes' else item.first_contact_due_at end,
    updated_by=auth.uid(),last_change_reason=trim(change_reason),updated_at=assigned_time
  where id=target_inquiry_id;

  insert into public.inquiry_assignment_history(inquiry_id,previous_owner_id,new_owner_id,assigned_by,reason,stage_at_assignment,is_reassignment,assigned_at)
  values(target_inquiry_id,item.owner_id,target_sales_id,auth.uid(),trim(change_reason),next_status,is_reassignment,assigned_time);
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,case when is_reassignment then 'reassignment' else 'assignment' end,trim(change_reason),
    jsonb_build_object('owner_id',item.owner_id,'status',item.status,'assigned_at',item.assigned_at),
    jsonb_build_object('owner_id',target_sales_id,'status',next_status,'assigned_at',case when reset_response_sla then assigned_time else item.assigned_at end));
  if is_reassignment then
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(item.owner_id,target_inquiry_id,'inquiry_reassigned_away','询盘已转派给其他业务员',trim(change_reason));
  end if;
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(target_sales_id,target_inquiry_id,case when is_reassignment then 'inquiry_reassigned' else 'inquiry_assigned' end,
    case when is_reassignment then '主管转派了一条询盘给你' else '主管已分配新询盘' end,trim(change_reason));
  select id into intake_id from public.email_intake where inquiry_id=target_inquiry_id;
  insert into public.integration_events(inquiry_id,email_intake_id,event_type,recipient_profile_id,payload)
  values(target_inquiry_id,intake_id,'notify_sales_assignment',target_sales_id,
    jsonb_build_object('is_reassignment',is_reassignment,'previous_owner_id',item.owner_id,'stage',next_status));
end;
$$;

revoke all on function public.assign_inquiry_to_sales(uuid,uuid,text) from public;
grant execute on function public.assign_inquiry_to_sales(uuid,uuid,text) to authenticated;
