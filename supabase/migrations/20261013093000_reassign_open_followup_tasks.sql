-- Keep ownership of open follow-up tasks aligned with the inquiry owner.
-- Historical/completed follow-ups retain their original author. Every moved
-- task receives an audit row with the previous and new responsible user.

create or replace function private.sync_open_followup_task_owner()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.owner_id is null or new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  with open_tasks as materialized (
    select f.id, f.author_id as previous_author_id
    from public.follow_ups f
    where f.inquiry_id=new.id
      and f.is_task=true
      and f.completed_at is null
      and f.author_id is distinct from new.owner_id
    for update
  ), moved as (
    update public.follow_ups f
    set author_id=new.owner_id
    from open_tasks o
    where f.id=o.id
    returning f.id, o.previous_author_id
  )
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  select auth.uid(),'follow_up',m.id,'task_reassigned','询盘转派时同步未完成跟进任务负责人',
    jsonb_build_object('author_id',m.previous_author_id,'inquiry_id',new.id),
    jsonb_build_object('author_id',new.owner_id,'inquiry_id',new.id)
  from moved m;

  return new;
end;
$$;

drop trigger if exists sync_open_followup_task_owner on public.inquiries;
create trigger sync_open_followup_task_owner
after update of owner_id on public.inquiries
for each row
when (new.owner_id is distinct from old.owner_id)
execute function private.sync_open_followup_task_owner();

-- Repair open tasks created before the trigger existed. This is intentionally
-- limited to active task rows; completed follow-ups and communication evidence
-- keep their original author.
with mismatched as materialized (
  select f.id, f.inquiry_id, f.author_id as previous_author_id, i.owner_id as new_author_id
  from public.follow_ups f
  join public.inquiries i on i.id=f.inquiry_id
  where f.is_task=true
    and f.completed_at is null
    and i.owner_id is not null
    and f.author_id is distinct from i.owner_id
  for update of f
), moved as (
  update public.follow_ups f
  set author_id=m.new_author_id
  from mismatched m
  where f.id=m.id
  returning f.id,m.inquiry_id,m.previous_author_id,m.new_author_id
)
insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
select null,'follow_up',m.id,'task_reassigned','修复转派后未同步的未完成跟进任务负责人',
  jsonb_build_object('author_id',m.previous_author_id,'inquiry_id',m.inquiry_id),
  jsonb_build_object('author_id',m.new_author_id,'inquiry_id',m.inquiry_id)
from moved m;
