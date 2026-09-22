-- The unified manager scope is intentionally restrictive, but email messages
-- also belong to a personal mailbox independently of an inquiry.  Preserve
-- that private owner path so a sales manager can still read their own inbox;
-- team/inquiry messages remain limited to the approved management scope.
drop policy if exists crm_manager_scope on public.email_messages;

create policy crm_manager_scope on public.email_messages
as restrictive for select to authenticated
using (
  private.current_crm_role() is distinct from 'sales_manager'
  or exists (
    select 1
    from public.mailbox_connections mc
    where mc.id = email_messages.mailbox_connection_id
      and mc.mailbox_kind = 'personal'
      and mc.user_id = (select auth.uid())
  )
  or private.crm_manager_covers_inquiry((select auth.uid()), inquiry_id)
);

