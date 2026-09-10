-- Completing a follow-up must also refresh the inquiry's authoritative next action.
create or replace function public.complete_follow_up_task(target_follow_up_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.follow_ups;
  completed_time timestamptz := clock_timestamp();
  next_open_due timestamptz;
begin
  select * into task
  from public.follow_ups
  where id = target_follow_up_id
  for update;

  if not found then raise exception '跟进任务不存在'; end if;
  if task.author_id <> auth.uid() and private.current_crm_role() not in ('owner','sales_manager') then
    raise exception '无权完成该跟进任务';
  end if;
  if task.completed_at is not null then return; end if;

  update public.follow_ups
  set completed_at = completed_time,
      completion_status = case
        when next_follow_up_at is not null and completed_time > next_follow_up_at then 'overdue'
        else 'on_time'
      end
  where id = target_follow_up_id;

  select min(f.next_follow_up_at) into next_open_due
  from public.follow_ups f
  where f.inquiry_id = task.inquiry_id
    and f.completed_at is null
    and f.next_follow_up_at is not null;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries
  set next_follow_up_at = next_open_due,
      updated_by = auth.uid(),
      updated_at = completed_time,
      last_change_reason = case
        when next_open_due is null then '完成跟进任务，当前无后续待办'
        else '完成跟进任务，切换到下一条待办'
      end
  where id = task.inquiry_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(
    auth.uid(),'follow_up',target_follow_up_id,'task_completed',
    jsonb_build_object('completed_at',task.completed_at,'next_follow_up_at',task.next_follow_up_at),
    jsonb_build_object('completed_at',completed_time,'completion_status',case when task.next_follow_up_at is not null and completed_time > task.next_follow_up_at then 'overdue' else 'on_time' end,'inquiry_next_follow_up_at',next_open_due),
    '完成跟进任务并同步询盘下一跟进时间'
  );
end;
$$;

revoke all on function public.complete_follow_up_task(uuid) from public,anon;
grant execute on function public.complete_follow_up_task(uuid) to authenticated;

create table if not exists public.sales_daily_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  inquiry_id uuid references public.inquiries(id) on delete set null,
  plan_date date not null,
  planned_at timestamptz,
  title text not null check (length(btrim(title)) between 1 and 500),
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  key_result text,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists sales_daily_plans_owner_date_idx
  on public.sales_daily_plans(owner_id,plan_date,priority,planned_at);

alter table public.sales_daily_plans enable row level security;
drop policy if exists sales_daily_plans_read on public.sales_daily_plans;
create policy sales_daily_plans_read on public.sales_daily_plans for select to authenticated
using (owner_id=auth.uid() or private.current_crm_role() in ('owner','sales_manager'));
drop policy if exists sales_daily_plans_insert on public.sales_daily_plans;
create policy sales_daily_plans_insert on public.sales_daily_plans for insert to authenticated
with check (owner_id=auth.uid() and private.current_crm_role() in ('owner','sales_manager','sales'));
drop policy if exists sales_daily_plans_update on public.sales_daily_plans;
create policy sales_daily_plans_update on public.sales_daily_plans for update to authenticated
using (owner_id=auth.uid()) with check (owner_id=auth.uid());

grant select,insert,update on public.sales_daily_plans to authenticated;
grant all on public.sales_daily_plans to service_role;

create or replace function public.create_sales_daily_plan(
  target_plan_date date,
  plan_title text,
  plan_priority text default 'normal',
  planned_for timestamptz default null,
  target_inquiry_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved_id uuid;
begin
  if actor is null or private.current_crm_role() not in ('owner','sales_manager','sales') then raise exception '当前账号无权新增每日计划'; end if;
  if target_plan_date is null or target_plan_date < current_date-interval '365 days' or target_plan_date > current_date+interval '365 days' then raise exception '请选择一年范围内的计划日期'; end if;
  if nullif(btrim(plan_title),'') is null then raise exception '请填写计划事项'; end if;
  if plan_priority not in ('high','normal','low') then raise exception '请选择有效优先级'; end if;
  if planned_for is not null and (planned_for at time zone 'Asia/Shanghai')::date <> target_plan_date then raise exception '计划时间必须属于所选日期'; end if;
  if target_inquiry_id is not null and not exists(
    select 1 from public.inquiries i where i.id=target_inquiry_id
      and (i.owner_id=actor or private.current_crm_role() in ('owner','sales_manager'))
  ) then raise exception '无权关联该询盘'; end if;
  insert into public.sales_daily_plans(owner_id,inquiry_id,plan_date,planned_at,title,priority)
  values(actor,target_inquiry_id,target_plan_date,planned_for,btrim(plan_title),plan_priority) returning id into saved_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'daily_plan',saved_id,'daily_plan_created',jsonb_build_object('plan_date',target_plan_date,'planned_at',planned_for,'priority',plan_priority,'inquiry_id',target_inquiry_id),'新增每日工作计划');
  return saved_id;
end $$;

create or replace function public.save_sales_daily_plan_result(target_plan_id uuid,result_text text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.sales_daily_plans; done_at timestamptz:=clock_timestamp();
begin
  select * into item from public.sales_daily_plans where id=target_plan_id for update;
  if not found then raise exception '每日计划不存在'; end if;
  if item.owner_id<>actor then raise exception '只能填写自己的计划成果'; end if;
  if nullif(btrim(result_text),'') is null then raise exception '请填写关键成果'; end if;
  update public.sales_daily_plans set key_result=btrim(result_text),completed_at=coalesce(completed_at,done_at),updated_at=done_at where id=target_plan_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor,'daily_plan',target_plan_id,case when item.completed_at is null then 'daily_plan_completed' else 'daily_plan_result_updated' end,
    jsonb_build_object('key_result',item.key_result,'completed_at',item.completed_at),jsonb_build_object('key_result',btrim(result_text),'completed_at',coalesce(item.completed_at,done_at)),'填写每日计划关键成果');
end $$;

revoke all on function public.create_sales_daily_plan(date,text,text,timestamptz,uuid) from public,anon;
revoke all on function public.save_sales_daily_plan_result(uuid,text) from public,anon;
grant execute on function public.create_sales_daily_plan(date,text,text,timestamptz,uuid) to authenticated;
grant execute on function public.save_sales_daily_plan_result(uuid,text) to authenticated;
