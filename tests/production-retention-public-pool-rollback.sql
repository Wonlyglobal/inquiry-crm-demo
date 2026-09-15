-- Production-safe proof that ownership and retention fields cannot bypass workflows.
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
    update public.inquiries set retained_until=current_date+30 where id=target_inquiry;
    raise exception 'RETENTION_BYPASS_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='RETENTION_BYPASS_NOT_BLOCKED'
      or position('负责人、客户保留期限和公海状态必须通过对应审批流程修改' in blocked_message)=0 then raise;
    end if;
  end;

  begin
    update public.inquiries set owner_id=null,public_pool_entered_at=clock_timestamp() where id=target_inquiry;
    raise exception 'PUBLIC_POOL_BYPASS_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='PUBLIC_POOL_BYPASS_NOT_BLOCKED'
      or position('负责人、客户保留期限和公海状态必须通过对应审批流程修改' in blocked_message)=0 then raise;
    end if;
  end;
end;
$$;

select 'PASS — direct retention/ownership/public-pool writes blocked; all writes will be rolled back' as production_regression;
rollback;
