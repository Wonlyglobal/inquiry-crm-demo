-- Keep all customer-facing sales records on the same visibility boundary as
-- inquiries.  The former policies only checked that an inquiry existed,
-- which made every authenticated salesperson able to read another owner's
-- messages, summaries, follow-ups and quotations.

drop policy if exists communication_summaries_read_visible on public.communication_summaries;
create policy communication_summaries_read_visible
on public.communication_summaries for select to authenticated
using (
  private.current_crm_role() = any (array['owner'::crm_role,'sales_manager'::crm_role,'marketing'::crm_role])
  or exists (
    select 1 from public.inquiries i
    where i.id = communication_summaries.inquiry_id
      and i.owner_id = (select auth.uid())
  )
);

drop policy if exists email_messages_read_visible on public.email_messages;
create policy email_messages_read_visible
on public.email_messages for select to authenticated
using (
  exists (
    select 1 from public.mailbox_connections mc
    where mc.id = email_messages.mailbox_connection_id
      and mc.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.inquiries i
    where i.id = email_messages.inquiry_id
      and (
        i.owner_id = (select auth.uid())
        or private.current_crm_role() = any (array['owner'::crm_role,'sales_manager'::crm_role,'marketing'::crm_role])
      )
  )
  or (
    email_messages.inquiry_id is null
    and private.current_crm_role() = any (array['owner'::crm_role,'sales_manager'::crm_role,'marketing'::crm_role])
  )
);

drop policy if exists follow_ups_read on public.follow_ups;
create policy follow_ups_read
on public.follow_ups for select to authenticated
using (
  exists (
    select 1 from public.inquiries i
    where i.id = follow_ups.inquiry_id
      and (
        i.owner_id = (select auth.uid())
        or private.current_crm_role() = any (array['owner'::crm_role,'sales_manager'::crm_role,'marketing'::crm_role])
      )
  )
);

drop policy if exists follow_ups_insert on public.follow_ups;
create policy follow_ups_insert
on public.follow_ups for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.inquiries i
    where i.id = follow_ups.inquiry_id
      and (
        i.owner_id = (select auth.uid())
        or private.current_crm_role() = any (array['owner'::crm_role,'sales_manager'::crm_role,'marketing'::crm_role])
      )
  )
);

drop policy if exists quotation_versions_read on public.quotation_versions;
create policy quotation_versions_read
on public.quotation_versions for select to authenticated
using (
  exists (
    select 1 from public.inquiries i
    where i.id = quotation_versions.inquiry_id
      and (
        i.owner_id = (select auth.uid())
        or private.current_crm_role() = any (array['owner'::crm_role,'sales_manager'::crm_role,'marketing'::crm_role])
      )
  )
);
