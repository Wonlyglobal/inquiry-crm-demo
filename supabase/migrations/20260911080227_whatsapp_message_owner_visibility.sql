-- Allow the salesperson who owns an inquiry to read its WhatsApp messages,
-- even when the channel was created by a manager. Unlinked messages remain
-- visible only to the channel creator or manager/owner.
drop policy if exists whatsapp_messages_read_visible on public.whatsapp_messages;
create policy whatsapp_messages_read_visible on public.whatsapp_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.whatsapp_connections c
      where c.id = connection_id
        and (
          c.created_by = (select auth.uid())
          or private.current_crm_role() in ('owner','sales_manager')
          or (
            inquiry_id is not null
            and exists (
              select 1 from public.inquiries i
              where i.id = whatsapp_messages.inquiry_id
                and i.owner_id = (select auth.uid())
            )
          )
        )
    )
  );
