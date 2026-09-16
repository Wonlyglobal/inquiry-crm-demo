-- Follow-up records drive customer history, task state and response KPIs.
-- Browser roles may read their authorized scope, but all interactive writes
-- must pass the audited workflow functions.

drop policy if exists follow_ups_insert on public.follow_ups;
drop policy if exists follow_ups_update on public.follow_ups;
drop policy if exists follow_ups_delete on public.follow_ups;
revoke insert,update,delete on public.follow_ups from authenticated;

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
  actor uuid:=auth.uid();
  actor_role public.crm_role;
  item public.inquiries;
  followup_id uuid;
  occurred_at timestamptz:=clock_timestamp();
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor is null or actor_role not in ('owner','sales_manager','sales') then raise exception '当前角色不能新增销售跟进'; end if;
  if follow_method not in ('email','whatsapp','phone','meeting','other') then raise exception '请选择有效的跟进方式'; end if;
  if task_priority not in ('high','normal','low') then raise exception '请选择有效的优先级'; end if;
  if nullif(trim(follow_content),'') is null then raise exception '请填写跟进内容'; end if;
  if reminder_at is not null and (next_follow_at is null or reminder_at>next_follow_at) then raise exception '提醒时间不能晚于计划跟进时间'; end if;

  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.validity<>'valid' or item.invalid_review_status='pending' then raise exception '只有已确认有效且无待审无效申请的询盘才能跟进'; end if;
  if actor_role='sales' and item.owner_id is distinct from actor then raise exception '只能跟进本人负责的询盘'; end if;
  if item.status not in ('won','lost') and next_follow_at is null then raise exception '进行中商机必须设置下次跟进时间'; end if;
  if mark_first_valid_contact and (item.owner_id is null or item.assigned_at is null or item.first_valid_contact_at is not null) then raise exception '当前询盘不能重复记录首次有效联系'; end if;

  insert into public.follow_ups(inquiry_id,author_id,method,content,customer_feedback,next_follow_up_at,is_first_valid_contact,is_task,priority,remind_at)
  values(target_inquiry_id,actor,follow_method,trim(follow_content),nullif(trim(customer_response),''),next_follow_at,mark_first_valid_contact,next_follow_at is not null,task_priority,reminder_at)
  returning id into followup_id;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    first_valid_contact_at=case when mark_first_valid_contact then occurred_at else first_valid_contact_at end,
    next_follow_up_at=coalesce(next_follow_at,next_follow_up_at),updated_by=actor,
    last_change_reason=case when mark_first_valid_contact then '新增可核验跟进并确认首次有效联系' else '新增跟进任务' end,updated_at=occurred_at
  where id=target_inquiry_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'follow_up',followup_id,'task_created',jsonb_build_object('inquiry_id',target_inquiry_id,'priority',task_priority,'next_follow_up_at',next_follow_at,'remind_at',reminder_at),'新增跟进任务');
  return followup_id;
end;
$$;

create or replace function public.complete_follow_up_task(target_follow_up_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  actor_role public.crm_role;
  task public.follow_ups;
  completed_time timestamptz:=clock_timestamp();
  next_open_due timestamptz;
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor is null or actor_role not in ('owner','sales_manager','sales') then raise exception '当前账号无权完成跟进任务'; end if;

  select * into task from public.follow_ups where id=target_follow_up_id for update;
  if not found then raise exception '跟进任务不存在'; end if;
  if task.author_id<>actor and actor_role not in ('owner','sales_manager') then raise exception '无权完成该跟进任务'; end if;
  if task.completed_at is not null then return; end if;

  update public.follow_ups set
    completed_at=completed_time,
    completion_status=case when next_follow_up_at is not null and completed_time>next_follow_up_at then 'overdue' else 'on_time' end
  where id=target_follow_up_id;

  select min(f.next_follow_up_at) into next_open_due from public.follow_ups f
  where f.inquiry_id=task.inquiry_id and f.completed_at is null and f.next_follow_up_at is not null;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    next_follow_up_at=next_open_due,updated_by=actor,updated_at=completed_time,
    last_change_reason=case when next_open_due is null then '完成跟进任务，当前无后续待办' else '完成跟进任务，切换到下一条待办' end
  where id=task.inquiry_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor,'follow_up',target_follow_up_id,'task_completed',
    jsonb_build_object('completed_at',task.completed_at,'next_follow_up_at',task.next_follow_up_at),
    jsonb_build_object('completed_at',completed_time,'completion_status',case when task.next_follow_up_at is not null and completed_time>task.next_follow_up_at then 'overdue' else 'on_time' end,'inquiry_next_follow_up_at',next_open_due),
    '完成跟进任务并同步询盘下一跟进时间');
end;
$$;

revoke all on function public.record_inquiry_followup_v2(uuid,text,text,text,timestamptz,boolean,text,timestamptz) from public,anon;
revoke all on function public.complete_follow_up_task(uuid) from public,anon;
grant execute on function public.record_inquiry_followup_v2(uuid,text,text,text,timestamptz,boolean,text,timestamptz) to authenticated;
grant execute on function public.complete_follow_up_task(uuid) to authenticated;
