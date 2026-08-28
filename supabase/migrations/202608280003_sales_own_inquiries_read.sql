-- Sales members can read only inquiries currently assigned to themselves.
-- Managers, marketing and owners continue to use their existing policies.
drop policy if exists inquiries_sales_read_own on public.inquiries;
create policy inquiries_sales_read_own
on public.inquiries
for select
to authenticated
using (
  private.current_crm_role() = 'sales'
  and owner_id = auth.uid()
);

