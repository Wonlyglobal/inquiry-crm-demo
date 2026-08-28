-- Align inquiry mutation scope with CRM visibility rules.
-- Sales may update only inquiries currently assigned to themselves.
-- Owner, sales manager and marketing retain cross-team workflow access.

drop policy if exists inquiries_update on public.inquiries;
drop policy if exists inquiries_update_by_crm_role on public.inquiries;

create policy inquiries_update_by_crm_role
on public.inquiries
for update
to authenticated
using (
  private.current_crm_role() in ('owner', 'sales_manager', 'marketing')
  or (
    private.current_crm_role() = 'sales'
    and owner_id = auth.uid()
  )
)
with check (
  private.current_crm_role() in ('owner', 'sales_manager', 'marketing')
  or (
    private.current_crm_role() = 'sales'
    and owner_id = auth.uid()
  )
);
