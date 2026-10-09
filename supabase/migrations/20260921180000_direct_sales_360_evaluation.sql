-- Monthly evaluation can start from a person; cycle/task creation is atomic with submission.
-- Keep existing manager scope, immutable responses, shadow mode and owner publication.
begin;
create or replace function public.submit_direct_sales_360_evaluation(
  target_sales_id uuid, target_period_start date, target_scores jsonb,
  target_summary text default null, target_evidence text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles; subject public.profiles; cycle public.sales_360_cycles;
  result_id uuid; assignment_id uuid; selected_evaluator uuid; evaluator record;
  group_name text; result jsonb; month_end date;
begin
  select * into actor from public.profiles where id=auth.uid() and active=true
    and not is_test_data and data_environment='production';
  if actor.id is null or actor.role not in ('owner','sales_manager') then raise exception '仅老板或直属主管可以直接评分'; end if;
  select * into subject from public.profiles where id=target_sales_id and active=true and role='sales'
    and not is_test_data and data_environment='production';
  if subject.id is null or subject.id=actor.id then raise exception '请选择有效业务员，不能评价本人'; end if;
  if target_period_start is null or target_period_start<>date_trunc('month',target_period_start)::date
    or target_period_start>=date_trunc('month',timezone('Asia/Shanghai',clock_timestamp()))::date then
    raise exception '请选择已经结束的月份';
  end if;
  group_name:=case when actor.role='owner' then 'owner' else 'manager' end;
  if actor.role='sales_manager' and (actor.team is null or btrim(actor.team)='' or actor.team is distinct from subject.team)
    and not exists(select 1 from public.sales_360_evaluation_assignments a join public.sales_360_cycles c on c.id=a.cycle_id
      where a.subject_id=subject.id and a.evaluator_id=actor.id and a.evaluator_group='manager'
        and a.status<>'void' and c.period_start=target_period_start) then
    raise exception '当前账号不是该业务员的直属主管，请先核对团队或已有评价授权';
  end if;
  month_end:=(target_period_start+interval '1 month'-interval '1 day')::date;
  -- One month lock serializes first submissions and avoids duplicate cycle/task races.
  perform pg_advisory_xact_lock(hashtextextended('sales360:'||target_period_start::text,0));
  select * into cycle from public.sales_360_cycles where period_start=target_period_start and period_end=month_end for update;
  if cycle.id is null then
    insert into public.sales_360_cycles(period_start,period_end,shadow_mode,evaluation_due_at,created_by)
    values(target_period_start,month_end,true,clock_timestamp()+interval '5 days',actor.id) returning * into cycle;
    insert into public.sales_360_events(cycle_id,actor_id,event_type,after_data,reason)
    values(cycle.id,null,'cycle_created',jsonb_build_object('period_start',target_period_start,'shadow_mode',true,'source','direct_evaluation'),'直接评分按需建立月度影子周期');
  end if;
  if cycle.status<>'collecting' or clock_timestamp()>cycle.evaluation_due_at then raise exception '该月份已截止或发布，不能直接评分'; end if;
  insert into public.sales_360_results(cycle_id,sales_id,state) values(cycle.id,subject.id,'collecting')
    on conflict(cycle_id,sales_id) do nothing;
  select id into result_id from public.sales_360_results where cycle_id=cycle.id and sales_id=subject.id;
  if exists(select 1 from public.sales_360_evaluation_assignments a where a.cycle_id=cycle.id and a.subject_id=subject.id
    and a.evaluator_group=group_name and a.status<>'void' and a.evaluator_id<>actor.id) then
    raise exception '该月已有指定评价人，请使用已分配的评价任务';
  end if;
  insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
  values(cycle.id,result_id,subject.id,actor.id,group_name,cycle.evaluation_due_at)
    on conflict(cycle_id,subject_id,evaluator_id,evaluator_group) do nothing;
  select id into assignment_id from public.sales_360_evaluation_assignments a
    where a.cycle_id=cycle.id and a.subject_id=subject.id and a.evaluator_id=actor.id and a.evaluator_group=group_name;
  -- Seed the remaining required groups for this subject, without scoring on their behalf.
  insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
  values(cycle.id,result_id,subject.id,subject.id,'self',cycle.evaluation_due_at) on conflict do nothing;
  if not exists(select 1 from public.sales_360_evaluation_assignments a where a.cycle_id=cycle.id and a.subject_id=subject.id and a.evaluator_group='owner' and a.status<>'void') then
    select id into selected_evaluator from public.profiles where role='owner' and active=true and not is_test_data and data_environment='production' order by id limit 1;
    if selected_evaluator is not null then
      insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
      values(cycle.id,result_id,subject.id,selected_evaluator,'owner',cycle.evaluation_due_at) on conflict do nothing;
    end if;
  end if;
  if not exists(select 1 from public.sales_360_evaluation_assignments a where a.cycle_id=cycle.id and a.subject_id=subject.id and a.evaluator_group='manager' and a.status<>'void') then
    select id into selected_evaluator from public.profiles where role='sales_manager' and active=true and not is_test_data
      and data_environment='production' and team=subject.team order by id limit 1;
    if selected_evaluator is not null then
      insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
      values(cycle.id,result_id,subject.id,selected_evaluator,'manager',cycle.evaluation_due_at) on conflict do nothing;
    end if;
  end if;
  -- Do not resample any group already initialized for this monthly subject.
  if not exists(select 1 from public.sales_360_evaluation_assignments a where a.cycle_id=cycle.id and a.subject_id=subject.id and a.evaluator_group='peer') then
    for evaluator in select id from public.profiles where role='sales' and active=true and not is_test_data and data_environment='production'
      and id<>subject.id and team=subject.team order by md5(cycle.id::text||subject.id::text||id::text) limit 5 loop
      insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
      values(cycle.id,result_id,subject.id,evaluator.id,'peer',cycle.evaluation_due_at) on conflict do nothing;
    end loop;
  end if;
  if not exists(select 1 from public.sales_360_evaluation_assignments a where a.cycle_id=cycle.id and a.subject_id=subject.id and a.evaluator_group='marketing') then
    for evaluator in select id from public.profiles where role='marketing' and active=true and not is_test_data and data_environment='production'
      order by md5(cycle.id::text||subject.id::text||id::text) limit 3 loop
      insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
      values(cycle.id,result_id,subject.id,evaluator.id,'marketing',cycle.evaluation_due_at) on conflict do nothing;
    end loop;
  end if;
  result:=public.submit_sales_360_evaluation(assignment_id,target_scores,target_summary,target_evidence);
  return result;
end $$;
revoke all on function public.submit_direct_sales_360_evaluation(uuid,date,jsonb,text,text) from public,anon;
grant execute on function public.submit_direct_sales_360_evaluation(uuid,date,jsonb,text,text) to authenticated;
-- The first evaluator now creates the cycle. Do not expose that identity via the cycle table.
revoke select on public.sales_360_cycles from authenticated;
grant select(id,period_start,period_end,status,shadow_mode,formula_version,evaluation_due_at,appeal_due_at,created_at,locked_at)
  on public.sales_360_cycles to authenticated;
commit;
