-- A first response is a KPI-bearing fact. It must originate from the atomic
-- follow-up workflow, not from a direct inquiry update.
create or replace function private.enforce_first_valid_contact_evidence()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.first_valid_contact_at is not distinct from old.first_valid_contact_at then
    return new;
  end if;
  if old.first_valid_contact_at is not null then
    raise exception '首次有效联系时间已锁定，不能清空或改写';
  end if;
  if coalesce(current_setting('app.inquiry_workflow_rpc',true),'')<>'on' then
    raise exception '首次有效联系必须通过带跟进记录的服务端流程确认';
  end if;
  if new.assigned_at is null or new.first_valid_contact_at<new.assigned_at then
    raise exception '首次有效联系时间不能早于询盘分配时间';
  end if;
  if not exists(
    select 1
    from public.follow_ups f
    where f.inquiry_id=new.id
      and f.is_first_valid_contact=true
      and f.author_id=new.updated_by
      and abs(extract(epoch from (f.created_at-new.first_valid_contact_at)))<=5
  ) then
    raise exception '首次有效联系缺少同一事务生成的跟进证据';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_first_valid_contact_evidence() from public,anon,authenticated;
drop trigger if exists inquiries_first_valid_contact_evidence_guard on public.inquiries;
create trigger inquiries_first_valid_contact_evidence_guard
before update of first_valid_contact_at on public.inquiries
for each row execute function private.enforce_first_valid_contact_evidence();
