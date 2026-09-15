-- Generate retention-expiry reminders independently of page visits and use
-- the CRM's Asia/Shanghai business date rather than the database UTC date.

create or replace function private.process_retention_expiry_notifications()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  local_date date := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  inserted_count integer := 0;
begin
  with eligible as (
    select
      i.id,
      i.inquiry_no,
      i.title,
      i.retained_until,
      recipient.id as recipient_id,
      case when i.retained_until < local_date then 'retention_expired' else 'retention_expiring' end as notice_type,
      case when i.retained_until < local_date then '客户保留期已到' else '客户保留期临近' end as notice_title,
      case
        when i.retained_until < local_date then format('#%s %s · 保留期 %s 已到，请申请延期、转派或释放公海',
          lpad(coalesce(i.inquiry_no,0)::text,6,'0'),coalesce(i.title,'未命名询盘'),i.retained_until)
        else format('#%s %s · 将于 %s 到期，请提前补充进展或申请延期',
          lpad(coalesce(i.inquiry_no,0)::text,6,'0'),coalesce(i.title,'未命名询盘'),i.retained_until)
      end as notice_body
    from public.inquiries i
    join public.profiles owner_profile on owner_profile.id=i.owner_id and owner_profile.active=true
    cross join lateral (
      select owner_profile.id
      union
      select manager.id
      from public.profiles manager
      where manager.active=true and manager.role in ('owner','sales_manager')
    ) recipient
    where i.validity='valid'
      and i.status not in ('won','lost')
      and coalesce(i.excluded_from_dashboard,false)=false
      and i.public_pool_entered_at is null
      and i.retained_until is not null
      and i.retained_until <= local_date+7
  ), inserted as (
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    select e.recipient_id,e.id,e.notice_type,e.notice_title,e.notice_body
    from eligible e
    where not exists (
      select 1
      from public.notifications n
      where n.recipient_id=e.recipient_id
        and n.inquiry_id=e.id
        and n.type=e.notice_type
        and n.body=e.notice_body
        and (n.created_at at time zone 'Asia/Shanghai')::date=local_date
    )
    returning 1
  )
  select count(*) into inserted_count from inserted;

  return jsonb_build_object('inserted',inserted_count,'business_date',local_date,'processed_at',clock_timestamp());
end;
$$;

revoke all on function private.process_retention_expiry_notifications() from public,anon,authenticated;
grant execute on function private.process_retention_expiry_notifications() to service_role;

create or replace function public.sync_retention_notifications()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  member_role text := private.current_crm_role();
  local_date date := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  item record;
  notice_type text;
  notice_title text;
  notice_body text;
  inserted_count integer := 0;
begin
  if member_role not in ('owner','sales_manager','sales') then return 0; end if;

  for item in
    select i.id,i.inquiry_no,i.title,i.retained_until
    from public.inquiries i
    where i.validity='valid'
      and i.status not in ('won','lost')
      and coalesce(i.excluded_from_dashboard,false)=false
      and i.owner_id is not null
      and i.public_pool_entered_at is null
      and i.retained_until is not null
      and i.retained_until <= local_date+7
      and (member_role in ('owner','sales_manager') or i.owner_id=auth.uid())
  loop
    if item.retained_until < local_date then
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
        and (n.created_at at time zone 'Asia/Shanghai')::date=local_date
    ) then
      insert into public.notifications(recipient_id,inquiry_id,type,title,body)
      values(auth.uid(),item.id,notice_type,notice_title,notice_body);
      inserted_count := inserted_count+1;
    end if;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function public.sync_retention_notifications() from public,anon;
grant execute on function public.sync_retention_notifications() to authenticated;

create extension if not exists pg_cron with schema extensions;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='notify-crm-retention-expiry-daily';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  -- pg_cron uses UTC; 16:20 UTC is 00:20 in Asia/Shanghai.
  perform cron.schedule('notify-crm-retention-expiry-daily','20 16 * * *','select private.process_retention_expiry_notifications()');
end $$;

select private.process_retention_expiry_notifications();
