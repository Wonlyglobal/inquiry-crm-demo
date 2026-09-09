drop policy if exists email_messages_read_visible on public.email_messages;
create policy email_messages_read_visible on public.email_messages for select to authenticated
  using (
    exists (
      select 1 from public.mailbox_connections mc
      where mc.id=email_messages.mailbox_connection_id
        and mc.user_id=auth.uid()
    )
    or inquiry_id is null
    or exists(select 1 from public.inquiries i where i.id=email_messages.inquiry_id)
  );
