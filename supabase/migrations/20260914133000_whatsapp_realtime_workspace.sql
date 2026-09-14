-- Stream WhatsApp message inserts and delivery updates to the authenticated CRM workspace.
alter table public.whatsapp_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.whatsapp_messages;
exception
  when duplicate_object then null;
end
$$;
