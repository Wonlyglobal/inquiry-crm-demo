begin;

-- Manual owner/marketing creation enters the supervisor assignment pool before
-- an owner exists. The inquiries table now requires a response deadline, so the
-- existing RPC's explicit NULL must be normalized without weakening the column.
create or replace function private.ensure_manual_opportunity_first_contact_due()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.first_contact_due_at is null
     and new.owner_id is null
     and new.status='pending_assignment'
     and new.last_change_reason='市场/管理员登记并提交主管分配' then
    new.first_contact_due_at:=coalesce(new.submitted_for_assignment_at,new.created_at,clock_timestamp())+interval '4 hours';
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_manual_opportunity_first_contact_due() from public,anon,authenticated;

drop trigger if exists ensure_manual_opportunity_first_contact_due_on_insert on public.inquiries;
create trigger ensure_manual_opportunity_first_contact_due_on_insert
before insert on public.inquiries
for each row execute function private.ensure_manual_opportunity_first_contact_due();

comment on function private.ensure_manual_opportunity_first_contact_due() is
  'Preserves the non-null response SLA for owner/marketing-created opportunities awaiting supervisor assignment.';

commit;
