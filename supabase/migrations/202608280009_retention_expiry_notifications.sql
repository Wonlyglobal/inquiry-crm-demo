-- Idempotent retention-expiry reminders generated when an eligible member
-- opens the CRM. This never changes ownership or inquiry workflow state.
create or replace function public.sync_retention_notifications()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  member_role text := private.current_crm_role();
  item record;
  notice_type text;
  notice_title text;
  notice_body text;
  inserted_count integer := 0;
begin
  if member_role not in ('owner','sales_manager','sales') then
    return 0;
  end if;

  for item in
    select i.id, i.inquiry_no, i.title, i.retained_until
    from public.inquiries i
    where i.validity='valid'
      and i.status not in ('won','lost')
      and i.retained_until is not null
      and i.retained_until <= current_date + 7
      and (member_role in ('owner','sales_manager') or i.owner_id=auth.uid())
  loop
    if item.retained_until < current_date then
      notice_type := 'retention_expired';
      notice_title := '客户保留期已到';
      notice_body := format('#%s %s · 保留期 %s 已到，请申请延期、转派或释放公海',
        lpad(coalesce(item.inquiry_no,0)::text,6,'0'),coalesce(item.title,'未命名询盘'),item.retained_until);
    else
      notice_type := 'retention_expiring';
      notice_title := '客户保留期临近';
      notice_body := format('#%s %s · 将于 %s 到期，请提前补充进展或申请延期',
        lpad(coalesce(item.inquiry_no,0)::text,6,'0'),coalesce(item.title,'未命名询盘'),item.retained_until);
    end if;

    if not exists (
      select 1 from public.notifications n
      where n.recipient_id=auth.uid()
        and n.inquiry_id=item.id
        and n.type=notice_type
        and n.body=notice_body
        and n.created_at::date=current_date
    ) then
      insert into public.notifications(recipient_id,inquiry_id,type,title,body)
      values(auth.uid(),item.id,notice_type,notice_title,notice_body);
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.sync_retention_notifications() from public;
grant execute on function public.sync_retention_notifications() to authenticated;

