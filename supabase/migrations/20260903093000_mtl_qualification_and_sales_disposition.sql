-- MTL phase 1: progressive 6+1 qualification, explicit sales disposition and tiered SLA.

alter table public.inquiries
  add column if not exists qualification_identity text,
  add column if not exists qualification_need text,
  add column if not exists qualification_role text,
  add column if not exists qualification_value text,
  add column if not exists qualification_timing text,
  add column if not exists qualification_fit text,
  add column if not exists qualification_next_step text,
  add column if not exists qualification_score integer,
  add column if not exists lead_priority text not null default 'P2',
  add column if not exists sales_disposition text not null default 'pending',
  add column if not exists sales_disposition_at timestamptz,
  add column if not exists sales_disposition_by uuid references public.profiles(id),
  add column if not exists recycle_reason text;

alter table public.inquiries drop constraint if exists inquiries_qualification_score_check;
alter table public.inquiries add constraint inquiries_qualification_score_check
  check (qualification_score is null or qualification_score between 0 and 100);
alter table public.inquiries drop constraint if exists inquiries_lead_priority_check;
alter table public.inquiries add constraint inquiries_lead_priority_check
  check (lead_priority in ('P0','P1','P2','P3'));
alter table public.inquiries drop constraint if exists inquiries_sales_disposition_check;
alter table public.inquiries add constraint inquiries_sales_disposition_check
  check (sales_disposition in ('pending','accepted','recycled'));

create or replace function public.set_inquiry_sales_disposition(
  target_inquiry_id uuid,
  disposition text,
  disposition_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.inquiries; actor_role public.crm_role := private.current_crm_role(); occurred_at timestamptz := clock_timestamp();
begin
  if actor_role not in ('owner','sales_manager','sales') then raise exception '当前角色不能处理销售接收状态'; end if;
  if disposition not in ('accepted','recycled') then raise exception '请选择接收或退回培育'; end if;
  if nullif(trim(disposition_reason),'') is null then raise exception '请填写处理原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.validity <> 'valid' then raise exception '仅已确认有效的询盘可由销售处理'; end if;
  if actor_role='sales' and item.owner_id is distinct from auth.uid() then raise exception '只能处理本人负责的询盘'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    sales_disposition=disposition,
    sales_disposition_at=occurred_at,
    sales_disposition_by=auth.uid(),
    recycle_reason=case when disposition='recycled' then trim(disposition_reason) else null end,
    next_follow_up_at=case when disposition='recycled' then null else next_follow_up_at end,
    updated_by=auth.uid(), last_change_reason=trim(disposition_reason), updated_at=occurred_at
  where id=target_inquiry_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,
    case when disposition='accepted' then 'sales_accepted' else 'recycled_to_marketing' end,
    trim(disposition_reason),
    jsonb_build_object('sales_disposition',item.sales_disposition,'recycle_reason',item.recycle_reason),
    jsonb_build_object('sales_disposition',disposition,'recycle_reason',case when disposition='recycled' then trim(disposition_reason) else null end));
end;
$$;

revoke all on function public.set_inquiry_sales_disposition(uuid,text,text) from public;
grant execute on function public.set_inquiry_sales_disposition(uuid,text,text) to authenticated;

