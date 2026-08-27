alter table public.mailbox_connections
  alter column user_id drop not null;

alter table public.mailbox_connections
  drop constraint if exists mailbox_connections_user_id_key;

create unique index if not exists mailbox_connections_personal_user_unique
  on public.mailbox_connections(user_id)
  where mailbox_kind = 'personal' and user_id is not null;

drop policy if exists mailbox_connections_read on public.mailbox_connections;
create policy mailbox_connections_read on public.mailbox_connections for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.current_crm_role() = 'owner'
    or (
      mailbox_kind = 'shared_inquiry'
      and lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
        'chloelee@wonlyglobal.com',
        'lyle@wonlyglobal.com',
        'lingzx@wonlyglobal.com'
      )
    )
  );
