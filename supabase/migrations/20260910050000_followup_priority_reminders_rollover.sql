-- Follow-up task priority, reminder and auditable next-day rollover.

alter table public.follow_ups
  add column if not exists priority text not null default 'normal' check (priority in ('high','normal','low')),
  add column if not exists remind_at timestamptz,
  add column if not exists original_due_at timestamptz,
  add column if not exists rollover_count integer not null default 0 check (rollover_count >= 0),
  add column if not exists last_rolled_at timestamptz;

create index if not exists follow_ups_open_owner_due_idx
  on public.follow_ups(author_id,priority,next_follow_up_at)
  where completed_at is null and next_follow_up_at is not null;
create index if not exists follow_ups_reminder_due_idx
  on public.follow_ups(author_id,remind_at)
  where completed_at is null and remind_at is not null;

create or replace function public.record_inquiry_followup_v2(
  target_inquiry_id uuid,
  follow_method text,
  follow_content text,
  customer_response text default null,
  next_follow_at timestamptz default null,
  mark_first_valid_contact boolean default false,
  task_priority text default 'normal',
  reminder_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_role public.crm_role := private.current_crm_role();
  item public.inquiries;
  followup_id uuid;
  occurred_at timestamptz := clock_timestamp();
begin
  if actor_role not in ('owner','sales_manager','sales') then raise exception '当前角色不能新增销售跟进'; end if;
  if follow_method not in ('email','whatsapp','phone','meeting','other') then raise exception '请选择有效的跟进方式'; end if;
  if task_priority not in ('high','normal','low') then raise exception '请选择有效的优先级'; end if;
  if nullif(trim(follow_content),'') is null then raise exception '请填写跟进内容'; end if;
  if reminder_at is not null and (next_follow_at is null or reminder_at > next_follow_at) then raise exception '提醒时间不能晚于计划跟进时间'; end if;

  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.validity <> 'valid' or item.invalid_review_status='pending' then raise exception '只有已确认有效且无待审无效申请的询盘才能跟进'; end if;
  if actor_role='sales' and item.owner_id is distinct from auth.uid() then raise exception '只能跟进本人负责的询盘'; end if;
  if item.status not in ('won','lost') and next_follow_at is null then raise exception '进行中商机必须设置下次跟进时间'; end if;
  if mark_first_valid_contact and (item.owner_id is null or item.assigned_at is null or item.first_valid_contact_at is not null) then raise exception '当前询盘不能重复记录首次有效联系'; end if;

  insert into public.follow_ups(inquiry_id,author_id,method,content,customer_feedback,next_follow_up_at,is_first_valid_contact,is_task,priority,remind_at)
  values(target_inquiry_id,auth.uid(),follow_method,trim(follow_content),nullif(trim(customer_response),''),next_follow_at,mark_first_valid_contact,next_follow_at is not null,task_priority,reminder_at)
  returning id into followup_id;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    first_valid_contact_at=case when mark_first_valid_contact then occurred_at else first_valid_contact_at end,
    next_follow_up_at=coalesce(next_follow_at,next_follow_up_at),updated_by=auth.uid(),
    last_change_reason=case when mark_first_valid_contact then '新增可核验跟进并确认首次有效联系' else '新增跟进任务' end,updated_at=occurred_at
  where id=target_inquiry_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(auth.uid(),'follow_up',followup_id,'task_created',jsonb_build_object('inquiry_id',target_inquiry_id,'priority',task_priority,'next_follow_up_at',next_follow_at,'remind_at',reminder_at),'新增跟进任务');
  return followup_id;
end;
$$;

create or replace function public.rollover_my_follow_up_tasks()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare actor_id uuid:=auth.uid(); moved integer:=0;
begin
  if actor_id is null or not exists(select 1 from public.profiles p where p.id=actor_id and p.active=true and p.role in ('owner','sales_manager','sales')) then
    raise exception '当前账号无权顺延跟进任务';
  end if;
  with overdue as (
    select f.id,f.next_follow_up_at
    from public.follow_ups f
    where f.author_id=actor_id and f.completed_at is null and f.next_follow_up_at is not null
      and (f.next_follow_up_at at time zone 'Asia/Shanghai')::date < (clock_timestamp() at time zone 'Asia/Shanghai')::date
    for update
  ), moved_rows as (
    update public.follow_ups f set
      original_due_at=coalesce(f.original_due_at,o.next_follow_up_at),
      next_follow_up_at=(((clock_timestamp() at time zone 'Asia/Shanghai')::date + (o.next_follow_up_at at time zone 'Asia/Shanghai')::time) at time zone 'Asia/Shanghai'),
      remind_at=case when f.remind_at is null then null else (((clock_timestamp() at time zone 'Asia/Shanghai')::date + (f.remind_at at time zone 'Asia/Shanghai')::time) at time zone 'Asia/Shanghai') end,
      rollover_count=f.rollover_count+1,last_rolled_at=clock_timestamp()
    from overdue o where f.id=o.id returning f.id,o.next_follow_up_at as old_due_at,f.next_follow_up_at as new_due_at,f.rollover_count
  )
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  select actor_id,'follow_up',m.id,'task_rolled_over',jsonb_build_object('next_follow_up_at',m.old_due_at),jsonb_build_object('next_follow_up_at',m.new_due_at,'rollover_count',m.rollover_count),'未完成跟进任务自动顺延到今日待办'
  from moved_rows m;
  get diagnostics moved=row_count;

  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  select actor_id,f.inquiry_id,'followup_reminder','跟进任务提醒',
    format('%s · 计划跟进时间 %s',f.content,to_char(f.next_follow_up_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI'))
  from public.follow_ups f
  where f.author_id=actor_id and f.completed_at is null and f.remind_at is not null and f.remind_at<=clock_timestamp()
    and not exists(
      select 1 from public.notifications n where n.recipient_id=actor_id and n.inquiry_id=f.inquiry_id
        and n.type='followup_reminder' and n.created_at::date=current_date
        and n.body=format('%s · 计划跟进时间 %s',f.content,to_char(f.next_follow_up_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI'))
    );
  return moved;
end;
$$;

revoke all on function public.record_inquiry_followup_v2(uuid,text,text,text,timestamptz,boolean,text,timestamptz) from public,anon;
grant execute on function public.record_inquiry_followup_v2(uuid,text,text,text,timestamptz,boolean,text,timestamptz) to authenticated;
revoke all on function public.rollover_my_follow_up_tasks() from public,anon;
grant execute on function public.rollover_my_follow_up_tasks() to authenticated;
