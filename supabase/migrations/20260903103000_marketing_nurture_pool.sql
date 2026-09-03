-- MTL phase 2: marketing nurture pool for sales-recycled leads.

alter table public.inquiries
  add column if not exists nurture_status text not null default 'inactive',
  add column if not exists nurture_next_at timestamptz,
  add column if not exists nurture_note text,
  add column if not exists nurture_updated_at timestamptz,
  add column if not exists nurture_updated_by uuid references public.profiles(id);

alter table public.inquiries drop constraint if exists inquiries_nurture_status_check;
alter table public.inquiries add constraint inquiries_nurture_status_check
  check (nurture_status in ('inactive','nurturing','ready'));

create or replace function public.save_inquiry_nurture(
  target_inquiry_id uuid, next_nurture_at timestamptz, nurture_content text, change_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.inquiries; occurred_at timestamptz := clock_timestamp();
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then raise exception '仅市场部、主管或老板可维护培育计划'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写修改原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.sales_disposition <> 'recycled' then raise exception '只有退回市场的线索可进入培育计划'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set nurture_status='nurturing',nurture_next_at=next_nurture_at,
    nurture_note=nullif(trim(nurture_content),''),nurture_updated_at=occurred_at,nurture_updated_by=auth.uid(),
    updated_at=occurred_at,updated_by=auth.uid(),last_change_reason=trim(change_reason)
  where id=target_inquiry_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'nurture_plan_updated',trim(change_reason),
    jsonb_build_object('nurture_status',item.nurture_status,'nurture_next_at',item.nurture_next_at,'nurture_note',item.nurture_note),
    jsonb_build_object('nurture_status','nurturing','nurture_next_at',next_nurture_at,'nurture_note',nullif(trim(nurture_content),'')));
end;
$$;

create or replace function public.resubmit_nurtured_inquiry(target_inquiry_id uuid, change_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.inquiries; occurred_at timestamptz := clock_timestamp();
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then raise exception '仅市场部、主管或老板可重新提交线索'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写重新提交依据'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.sales_disposition <> 'recycled' then raise exception '该线索当前不在市场培育池'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set sales_disposition='pending',sales_disposition_at=null,sales_disposition_by=null,
    recycle_reason=null,nurture_status='ready',nurture_next_at=null,nurture_updated_at=occurred_at,nurture_updated_by=auth.uid(),
    owner_id=null,status='pending_assignment',assigned_at=null,first_contact_due_at=occurred_at+interval '4 hours',
    updated_at=occurred_at,updated_by=auth.uid(),last_change_reason=trim(change_reason)
  where id=target_inquiry_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'nurture_resubmitted',trim(change_reason),
    jsonb_build_object('sales_disposition',item.sales_disposition,'owner_id',item.owner_id,'status',item.status,'nurture_status',item.nurture_status),
    jsonb_build_object('sales_disposition','pending','owner_id',null,'status','pending_assignment','nurture_status','ready'));
end;
$$;

revoke all on function public.save_inquiry_nurture(uuid,timestamptz,text,text) from public;
revoke all on function public.resubmit_nurtured_inquiry(uuid,text) from public;
grant execute on function public.save_inquiry_nurture(uuid,timestamptz,text,text) to authenticated;
grant execute on function public.resubmit_nurtured_inquiry(uuid,text) to authenticated;
