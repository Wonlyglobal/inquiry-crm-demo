-- Route assigned inquiry originals to the active assignee instead of a fixed manager.

create or replace function public.request_original_email_forward(target_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  intake_id uuid;
  sales_email text;
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then
    raise exception '仅市场部、销售主管或老板可转发原邮件';
  end if;
  select e.id, p.email into intake_id, sales_email
  from public.inquiries i
  join public.email_intake e on e.inquiry_id=i.id
  join public.profiles p on p.id=i.owner_id and p.role='sales' and p.active
  where i.id=target_inquiry_id
  order by e.created_at desc limit 1;
  if intake_id is null then raise exception '该询盘没有关联原始邮件或尚未分配业务员'; end if;
  if exists(select 1 from public.integration_events where email_intake_id=intake_id and event_type='forward_original_email' and delivery_status in ('pending','sent')) then
    raise exception '原邮件已在转发队列中或已经转发';
  end if;
  insert into public.integration_events(inquiry_id,email_intake_id,event_type,recipient_profile_id,payload)
  select target_inquiry_id,intake_id,'forward_original_email',i.owner_id,jsonb_build_object('to',sales_email)
  from public.inquiries i where i.id=target_inquiry_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'forward_requested','分配完成后请求从公共询盘邮箱转发原邮件给负责业务员',jsonb_build_object('recipient',sales_email));
end;
$$;

revoke all on function public.request_original_email_forward(uuid) from public;
grant execute on function public.request_original_email_forward(uuid) to authenticated;
