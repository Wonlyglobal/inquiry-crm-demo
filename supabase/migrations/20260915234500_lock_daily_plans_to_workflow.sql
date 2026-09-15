-- Daily plans are business workflow records: browser roles may read their scope,
-- but creation and completion must pass the audited RPCs.

drop policy if exists sales_daily_plans_insert on public.sales_daily_plans;
drop policy if exists sales_daily_plans_update on public.sales_daily_plans;
revoke insert,update,delete on public.sales_daily_plans from authenticated;

create or replace function public.create_sales_daily_plan(
  target_plan_date date,
  plan_title text,
  plan_priority text default 'normal',
  planned_for timestamptz default null,
  target_inquiry_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  actor_role public.crm_role;
  saved_id uuid;
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor is null or actor_role not in ('owner','sales_manager','sales') then raise exception '当前账号无权新增每日计划'; end if;
  if target_plan_date is null or target_plan_date < current_date-interval '365 days' or target_plan_date > current_date+interval '365 days' then raise exception '请选择一年范围内的计划日期'; end if;
  if nullif(btrim(plan_title),'') is null then raise exception '请填写计划事项'; end if;
  if length(btrim(plan_title))>500 then raise exception '计划事项不能超过500字'; end if;
  if plan_priority not in ('high','normal','low') then raise exception '请选择有效优先级'; end if;
  if planned_for is not null and (planned_for at time zone 'Asia/Shanghai')::date <> target_plan_date then raise exception '计划时间必须属于所选日期'; end if;
  if target_inquiry_id is not null and not exists(
    select 1 from public.inquiries i where i.id=target_inquiry_id
      and (i.owner_id=actor or actor_role in ('owner','sales_manager'))
  ) then raise exception '无权关联该询盘'; end if;
  insert into public.sales_daily_plans(owner_id,inquiry_id,plan_date,planned_at,title,priority)
  values(actor,target_inquiry_id,target_plan_date,planned_for,btrim(plan_title),plan_priority) returning id into saved_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'daily_plan',saved_id,'daily_plan_created',jsonb_build_object('plan_date',target_plan_date,'planned_at',planned_for,'priority',plan_priority,'inquiry_id',target_inquiry_id),'新增每日工作计划');
  return saved_id;
end $$;

create or replace function public.save_sales_daily_plan_result(target_plan_id uuid,result_text text)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  actor_role public.crm_role;
  item public.sales_daily_plans;
  done_at timestamptz:=clock_timestamp();
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor is null or actor_role not in ('owner','sales_manager','sales') then raise exception '当前账号无权填写计划成果'; end if;
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
grant execute on function public.create_sales_daily_plan(date,text,text,timestamptz,uuid) to service_role;
grant execute on function public.save_sales_daily_plan_result(uuid,text) to service_role;
