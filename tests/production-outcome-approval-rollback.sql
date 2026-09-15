-- Production-safe proof that direct won/lost transitions cannot bypass approval.
-- Run the whole file as a privileged database operator. Every write is rolled back.
begin;

do $$
declare
  target_inquiry uuid;
  blocked_message text;
begin
  select id into target_inquiry
  from public.inquiries
  where title like '[功能测试]%'
    and owner_id is not null
    and validity='valid'
    and status not in ('won','lost')
  order by created_at desc
  limit 1;
  if target_inquiry is null then raise exception 'NO_FUNCTIONAL_TEST_FIXTURE'; end if;

  begin
    update public.inquiries set status='won' where id=target_inquiry;
    raise exception 'WON_BYPASS_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='WON_BYPASS_NOT_BLOCKED' or position('成交或丢单必须通过申请与主管审批流程' in blocked_message)=0 then
      raise;
    end if;
  end;

  begin
    update public.inquiries set status='lost',lost_reason='[other] rollback test' where id=target_inquiry;
    raise exception 'LOST_BYPASS_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='LOST_BYPASS_NOT_BLOCKED' or position('成交或丢单必须通过申请与主管审批流程' in blocked_message)=0 then
      raise;
    end if;
  end;
end;
$$;

select 'PASS — direct won/lost transitions blocked; all writes will be rolled back' as production_regression;
rollback;
