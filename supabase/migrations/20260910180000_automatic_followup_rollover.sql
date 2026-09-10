-- Run follow-up rollover and reminders independently of users opening the CRM.
create or replace function private.process_follow_up_schedule()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare moved integer:=0; reminded integer:=0;
begin
  with overdue as (
    select f.id,f.author_id,f.next_follow_up_at
    from public.follow_ups f
    join public.inquiries i on i.id=f.inquiry_id
    join public.profiles p on p.id=f.author_id and p.active=true
    where f.completed_at is null and f.next_follow_up_at is not null
      and i.status not in ('won','lost')
      and (f.next_follow_up_at at time zone 'Asia/Shanghai')::date < (clock_timestamp() at time zone 'Asia/Shanghai')::date
    for update of f skip locked
  ), moved_rows as (
    update public.follow_ups f set
      original_due_at=coalesce(f.original_due_at,o.next_follow_up_at),
      next_follow_up_at=(((clock_timestamp() at time zone 'Asia/Shanghai')::date + (o.next_follow_up_at at time zone 'Asia/Shanghai')::time) at time zone 'Asia/Shanghai'),
      remind_at=case when f.remind_at is null then null else (((clock_timestamp() at time zone 'Asia/Shanghai')::date + (f.remind_at at time zone 'Asia/Shanghai')::time) at time zone 'Asia/Shanghai') end,
      rollover_count=f.rollover_count+1,last_rolled_at=clock_timestamp()
    from overdue o where f.id=o.id
    returning f.id,f.author_id,o.next_follow_up_at as old_due_at,f.next_follow_up_at as new_due_at,f.rollover_count
  ), audited as (
    insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
    select m.author_id,'follow_up',m.id,'task_rolled_over',jsonb_build_object('next_follow_up_at',m.old_due_at),jsonb_build_object('next_follow_up_at',m.new_due_at,'rollover_count',m.rollover_count),'系统自动将未完成跟进任务顺延到今日待办'
    from moved_rows m returning 1
  ) select count(*) into moved from audited;

  with inserted as (
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    select f.author_id,f.inquiry_id,'followup_reminder','跟进任务提醒',
      format('[任务:%s] %s · 计划跟进时间 %s',f.id,f.content,to_char(f.next_follow_up_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI'))
    from public.follow_ups f
    join public.inquiries i on i.id=f.inquiry_id
    join public.profiles p on p.id=f.author_id and p.active=true
    where f.completed_at is null and i.status not in ('won','lost')
      and f.remind_at is not null and f.remind_at<=clock_timestamp()
      and not exists(
        select 1 from public.notifications n
        where n.recipient_id=f.author_id and n.type='followup_reminder'
          and n.body like '[任务:'||f.id::text||']%'
      )
    returning 1
  ) select count(*) into reminded from inserted;

  return jsonb_build_object('rolled_over',moved,'reminded',reminded,'processed_at',clock_timestamp());
end;
$$;

revoke all on function private.process_follow_up_schedule() from public,anon,authenticated;
grant execute on function private.process_follow_up_schedule() to service_role;

create extension if not exists pg_cron with schema extensions;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='process-crm-followups-every-5-minutes';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('process-crm-followups-every-5-minutes','*/5 * * * *','select private.process_follow_up_schedule()');
end $$;

select private.process_follow_up_schedule();
