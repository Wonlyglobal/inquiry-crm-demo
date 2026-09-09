create or replace function public.get_shared_inquiry_mailbox_status()
returns table(email text,status text,last_synced_at timestamptz,error_message text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception '未登录'; end if;
  return query
    select mc.email,mc.status,mc.last_synced_at,mc.error_message
    from public.mailbox_connections mc
    where mc.mailbox_kind='shared_inquiry'
      and lower(mc.email)='inquiry@wonlyglobal.com'
    order by mc.updated_at desc
    limit 1;
end;
$$;

revoke all on function public.get_shared_inquiry_mailbox_status() from public, anon;
grant execute on function public.get_shared_inquiry_mailbox_status() to authenticated;
