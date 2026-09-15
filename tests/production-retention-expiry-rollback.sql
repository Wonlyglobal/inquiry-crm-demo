-- Production-safe acceptance check for automatic retention reminders.
-- All inquiry and notification changes are rolled back.
begin;

do $$
declare
  local_date date := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  target_inquiry uuid;
  target_owner uuid;
  expected_recipients integer;
  actual_recipients integer;
begin
  select i.id,i.owner_id into target_inquiry,target_owner
  from public.inquiries i
  join public.profiles p on p.id=i.owner_id and p.active=true and p.role='sales'
  where i.title like '[功能测试]%'
    and i.validity='valid'
    and i.status not in ('won','lost')
    and coalesce(i.excluded_from_dashboard,false)=false
  order by i.created_at desc
  limit 1;
  if target_inquiry is null then raise exception 'NO_FUNCTIONAL_TEST_FIXTURE'; end if;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries
  set retained_until=local_date+3,public_pool_entered_at=null
  where id=target_inquiry;

  delete from public.notifications
  where inquiry_id=target_inquiry
    and type='retention_expiring'
    and (created_at at time zone 'Asia/Shanghai')::date=local_date;

  perform private.process_retention_expiry_notifications();

  select count(distinct recipient_id) into expected_recipients
  from (
    select target_owner as recipient_id
    union
    select id from public.profiles where active=true and role in ('owner','sales_manager')
  ) recipients;

  select count(distinct recipient_id) into actual_recipients
  from public.notifications
  where inquiry_id=target_inquiry
    and type='retention_expiring'
    and (created_at at time zone 'Asia/Shanghai')::date=local_date;

  if actual_recipients<>expected_recipients then
    raise exception 'RETENTION_NOTIFICATIONS_MISSING expected %, got %',expected_recipients,actual_recipients;
  end if;

  perform private.process_retention_expiry_notifications();
  if exists (
    select recipient_id
    from public.notifications
    where inquiry_id=target_inquiry
      and type='retention_expiring'
      and (created_at at time zone 'Asia/Shanghai')::date=local_date
    group by recipient_id
    having count(*)<>1
  ) then
    raise exception 'RETENTION_NOTIFICATIONS_NOT_IDEMPOTENT';
  end if;
end;
$$;

select 'PASS — owner and active managers received one automatic retention reminder; all writes will be rolled back' as production_regression;
rollback;
