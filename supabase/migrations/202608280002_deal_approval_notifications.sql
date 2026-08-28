drop policy if exists notifications_create_deal_approval on public.notifications;
create policy notifications_create_deal_approval on public.notifications
for insert to authenticated
with check (
  (
    type = 'won_approval_requested'
    and private.current_crm_role() = 'sales'
    and exists (select 1 from public.inquiries i where i.id = inquiry_id and i.owner_id = auth.uid())
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.role = 'sales_manager' and p.active = true)
  )
  or
  (
    type in ('won_approval_approved','won_approval_rejected')
    and private.current_crm_role() in ('owner','sales_manager')
    and exists (select 1 from public.inquiries i where i.id = inquiry_id and i.owner_id = recipient_id)
  )
);
