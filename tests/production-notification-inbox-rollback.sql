-- Production-safe acceptance check for recipient-scoped bulk notification reads.
-- Every inserted notification and read timestamp is rolled back.
begin;

do $$
declare
  actor_id uuid;
  other_id uuid;
  inquiry_id uuid;
  actor_notice uuid;
  other_notice uuid;
  updated_count integer;
begin
  select id into actor_id from public.profiles where active=true order by created_at limit 1;
  select id into other_id from public.profiles where active=true and id<>actor_id order by created_at limit 1;
  select id into inquiry_id from public.inquiries where title like '[功能测试]%' order by created_at desc limit 1;
  if actor_id is null or other_id is null or inquiry_id is null then raise exception 'NO_NOTIFICATION_TEST_FIXTURE'; end if;

  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(actor_id,inquiry_id,'functional_test','[功能测试] 通知批量已读','仅用于事务回滚验收')
  returning id into actor_notice;
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(other_id,inquiry_id,'functional_test','[功能测试] 其他成员通知','不得被当前成员更新')
  returning id into other_notice;

  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  updated_count:=public.mark_my_notifications_read();
  if updated_count<1 or not exists(select 1 from public.notifications where id=actor_notice and read_at is not null) then
    raise exception 'ACTOR_NOTIFICATION_NOT_MARKED_READ';
  end if;
  if exists(select 1 from public.notifications where id=other_notice and read_at is not null) then
    raise exception 'OTHER_RECIPIENT_NOTIFICATION_CHANGED';
  end if;
end;
$$;

select 'PASS — mark-all updated only the authenticated recipient; all writes will be rolled back' as production_regression;
rollback;
