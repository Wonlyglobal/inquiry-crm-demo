-- Keep the notification inbox complete and mark all unread rows atomically
-- for the authenticated recipient without sending an unbounded ID list.

create index if not exists notifications_recipient_unread_created_idx
on public.notifications(recipient_id,created_at desc)
where read_at is null;

create or replace function public.mark_my_notifications_read()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := auth.uid();
  updated_count integer := 0;
begin
  if actor_id is null or not exists(
    select 1 from public.profiles p where p.id=actor_id and p.active=true
  ) then
    raise exception '当前账号无权更新通知';
  end if;

  update public.notifications
  set read_at=clock_timestamp()
  where recipient_id=actor_id and read_at is null;
  get diagnostics updated_count=row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_my_notifications_read() from public,anon;
grant execute on function public.mark_my_notifications_read() to authenticated;
