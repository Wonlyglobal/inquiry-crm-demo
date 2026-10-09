-- 360 evaluation-only authorization; never grants customer/business management scope.
begin;
create table private.sales360_evaluator_teams (
 evaluator_id uuid not null references public.profiles(id), team text not null check(btrim(team)=team and team<>''),
 active boolean not null default true, reason text not null check(char_length(reason)>=8),
 approval_reference text not null check(char_length(approval_reference)>=8), primary key(evaluator_id,team)
);
create table private.sales360_evaluator_team_events (
 id bigint generated always as identity primary key, created_at timestamptz not null default clock_timestamp(),
 executor text not null, before_data jsonb,after_data jsonb not null
);
alter table private.sales360_evaluator_teams enable row level security;
alter table private.sales360_evaluator_team_events enable row level security;
revoke all on private.sales360_evaluator_teams,private.sales360_evaluator_team_events from public,anon,authenticated,service_role;
create function private.audit_sales360_evaluator_team() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.evaluator_id,new.team) is distinct from (old.evaluator_id,old.team)
 then raise exception '评价授权不可改绑，请停用后新建'; end if;
 insert into private.sales360_evaluator_team_events(executor,before_data,after_data)
 values(session_user,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function private.audit_sales360_evaluator_team() from public,anon,authenticated,service_role;
create trigger sales360_evaluator_teams_audit after insert or update on private.sales360_evaluator_teams
for each row execute function private.audit_sales360_evaluator_team();
create trigger sales360_evaluator_teams_no_delete before delete on private.sales360_evaluator_teams
for each row execute function private.reject_risk_event_mutation();
create trigger sales360_evaluator_team_events_immutable before update or delete on private.sales360_evaluator_team_events
for each row execute function private.reject_risk_event_mutation();
create function private.sales360_can_evaluate(evaluator uuid,subject_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles actor join public.profiles subject on subject.id=subject_id
 where actor.id=evaluator and actor.active and actor.role='sales_manager' and not actor.is_test_data and actor.data_environment='production'
 and subject.active and subject.role='sales' and not subject.is_test_data and subject.data_environment='production'
 and actor.id<>subject.id and (private.crm_manager_covers_user(evaluator,subject_id)
 or exists(select 1 from private.sales360_evaluator_teams t where t.evaluator_id=evaluator and t.team=subject.team and t.active)));
$$;
revoke all on function private.sales360_can_evaluate(uuid,uuid) from public,anon,authenticated,service_role;
create function public.get_my_sales360_scope() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; people jsonb; teams jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active and not is_test_data and data_environment='production';
 if actor.id is null or actor.role not in ('owner','sales_manager') then raise exception '仅评价管理角色可查询成员范围'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'team',p.team) order by p.full_name),'[]'::jsonb)
 into people from public.profiles p where p.role='sales' and p.active and not p.is_test_data and p.data_environment='production'
 and (actor.role='owner' or private.sales360_can_evaluate(actor.id,p.id));
 select coalesce(jsonb_agg(t.team order by t.team),'[]'::jsonb) into teams from
 (select distinct value->>'team' as team from jsonb_array_elements(people) where nullif(value->>'team','') is not null) t;
 return jsonb_build_object('people',people,'teams',teams,'start_month','2026-07');
end $$;
revoke all on function public.get_my_sales360_scope() from public,anon;
grant execute on function public.get_my_sales360_scope() to authenticated;

do $$ begin
 if md5(pg_get_functiondef('public.create_sales_360_cycle(date,boolean)'::regprocedure)) <> '0cb3b6ba5d474a7505d90c9b4bb10e02' then raise exception '评分函数create_sales_360_cycle已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.create_sales_360_cycle(target_period_start date, shadow_run boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid:=auth.uid(); actor_role public.crm_role; cycle_id uuid; result_id uuid;
  period_end date; due_at timestamptz; subject record; evaluator record; manager_id uuid;
begin
  if target_period_start < date '2026-07-01' then raise exception '成员评价从2026年第三季度开始'; end if;
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true and not p.is_test_data and p.data_environment='production';
  if actor_role is distinct from 'owner' then raise exception '仅老板可以创建 360 评分周期'; end if;
  if target_period_start is null or target_period_start<>date_trunc('month',target_period_start)::date then
    raise exception '评分周期必须从月份第一天开始';
  end if;
  if target_period_start>=date_trunc('month',current_date)::date then raise exception '只能为已经结束的月份创建评分周期'; end if;
  if not exists(select 1 from public.sales_360_cycles) then shadow_run:=true; end if;
  period_end:=(target_period_start+interval '1 month'-interval '1 day')::date;
  due_at:=greatest(((period_end+6)::timestamp at time zone 'Asia/Shanghai'),clock_timestamp()+interval '5 days');
  insert into public.sales_360_cycles(period_start,period_end,shadow_mode,evaluation_due_at,created_by)
  values(target_period_start,period_end,coalesce(shadow_run,true),due_at,actor)
  returning id into cycle_id;

  for subject in select p.id,p.team from public.profiles p where p.role='sales' and p.active=true and not p.is_test_data and p.data_environment='production' order by p.id loop
    insert into public.sales_360_results(cycle_id,sales_id,state)
    values(cycle_id,subject.id,'collecting') returning id into result_id;

    insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
    values(cycle_id,result_id,subject.id,subject.id,'self',due_at);
    insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
    values(cycle_id,result_id,subject.id,actor,'owner',due_at);

    select p.id into manager_id from public.profiles p
    where p.role='sales_manager' and p.active=true and not p.is_test_data and p.data_environment='production' and private.crm_manager_covers(p.id,subject.team)
    order by p.id limit 1;
    if manager_id is not null then
      insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
      values(cycle_id,result_id,subject.id,manager_id,'manager',due_at);
    end if;

    for evaluator in select p.id from public.profiles p
      where p.role='sales' and p.active=true and not p.is_test_data and p.data_environment='production' and p.id<>subject.id and p.team is not distinct from subject.team
      order by md5(cycle_id::text||subject.id::text||p.id::text) limit 5
    loop
      insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
      values(cycle_id,result_id,subject.id,evaluator.id,'peer',due_at);
    end loop;

    for evaluator in select p.id from public.profiles p where p.role='marketing' and p.active=true and not p.is_test_data and p.data_environment='production'
      order by md5(cycle_id::text||subject.id::text||p.id::text) limit 3
    loop
      insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
      values(cycle_id,result_id,subject.id,evaluator.id,'marketing',due_at);
    end loop;
  end loop;

  insert into public.sales_360_events(cycle_id,actor_id,event_type,after_data,reason)
  values(cycle_id,actor,'cycle_created',jsonb_build_object('period_start',target_period_start,'period_end',period_end,'shadow_mode',coalesce(shadow_run,true)),'创建 360 评分周期');
  return cycle_id;
exception when unique_violation then
  raise exception '该月份已经存在 360 评分周期';
end $function$;

do $$ begin
 if md5(pg_get_functiondef('public.get_my_sales_360_workspace()'::regprocedure)) <> '977e44c39c75b7d8b874c33656246fa2' then raise exception '评分函数get_my_sales_360_workspace已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.get_my_sales_360_workspace()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_profile public.profiles; tasks jsonb; own_results jsonb; visible_results jsonb; cycles jsonb; calibrations jsonb; appeals jsonb;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor_profile.id is null then raise exception '登录状态无效'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id',a.id,'result_id',a.result_id,'cycle_id',a.cycle_id,'subject_id',a.subject_id,
    'subject_name',s.full_name,'evaluator_group',a.evaluator_group,'status',a.status,'due_at',a.due_at,
    'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,
    'dimensions',private.sales_360_dimensions(a.evaluator_group)
  ) order by a.due_at,s.full_name),'[]'::jsonb) into tasks
  from public.sales_360_evaluation_assignments a
  join public.profiles s on s.id=a.subject_id join public.sales_360_cycles c on c.id=a.cycle_id
  where c.period_start>=date '2026-07-01' and a.evaluator_id=actor and a.status<>'void' and (a.evaluator_group<>'manager' or private.sales360_can_evaluate(actor,a.subject_id));

  select coalesce(jsonb_agg(jsonb_build_object(
    'result_id',r.id,'cycle_id',r.cycle_id,'period_start',c.period_start,'period_end',c.period_end,
    'shadow_mode',c.shadow_mode,'state',r.state,'objective_score',r.objective_score,
    'multirater_score',r.multirater_score,'total_score',r.total_score,'grade',r.grade,
    'bonus_multiplier',r.bonus_multiplier,'objective_metrics',r.objective_metrics,
    'multirater_summary',r.multirater_summary,'strengths',r.strengths,
    'improvement_areas',r.improvement_areas,'training_plan',r.training_plan,
    'new_hire_protected',r.new_hire_protected,'minimum_sample_met',r.minimum_sample_met,
    'veto_status',r.veto_status,'appeal_due_at',c.appeal_due_at,
    'target_won_amount_cny',g.target_won_amount_cny,'monthly_bonus_base',g.monthly_bonus_base,
    'target_note',g.target_note
  ) order by c.period_start desc),'[]'::jsonb) into own_results
  from public.sales_360_results r join public.sales_360_cycles c on c.id=r.cycle_id
  left join public.sales_360_goals g on g.result_id=r.id where r.sales_id=actor;

  if actor_profile.role='owner' then
    select coalesce(jsonb_agg(jsonb_build_object('result_id',r.id,'sales_id',r.sales_id,'sales_name',s.full_name,'team',s.team,'cycle_id',r.cycle_id,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'state',r.state,'objective_score',r.objective_score,'multirater_score',r.multirater_score,'total_score',r.total_score,'grade',r.grade,'bonus_multiplier',r.bonus_multiplier,'veto_status',r.veto_status,'appeal_due_at',c.appeal_due_at,'target_won_amount_cny',g.target_won_amount_cny,'monthly_bonus_base',g.monthly_bonus_base,'target_note',g.target_note,'new_hire_protected',r.new_hire_protected) order by c.period_start desc,s.full_name),'[]'::jsonb) into visible_results
    from public.sales_360_results r join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id left join public.sales_360_goals g on g.result_id=r.id;
  elsif actor_profile.role='sales_manager' then
    select coalesce(jsonb_agg(jsonb_build_object('result_id',r.id,'sales_id',r.sales_id,'sales_name',s.full_name,'team',s.team,'cycle_id',r.cycle_id,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'state',r.state,'objective_score',r.objective_score,'multirater_score',r.multirater_score,'total_score',r.total_score,'grade',r.grade,'bonus_multiplier',r.bonus_multiplier,'veto_status',r.veto_status,'appeal_due_at',c.appeal_due_at,'target_won_amount_cny',g.target_won_amount_cny,'monthly_bonus_base',g.monthly_bonus_base,'target_note',g.target_note,'new_hire_protected',r.new_hire_protected) order by c.period_start desc,s.full_name),'[]'::jsonb) into visible_results
    from public.sales_360_results r join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id left join public.sales_360_goals g on g.result_id=r.id
    where private.crm_manager_covers_user(actor,s.id);
  else visible_results:='[]'::jsonb; end if;

  if actor_profile.role='owner' then
    select coalesce(jsonb_agg(jsonb_build_object('calibration_id',x.id,'result_id',x.result_id,'sales_name',s.full_name,'team',s.team,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'original_total_score',x.original_total_score,'proposed_total_score',x.proposed_total_score,'reason',x.reason,'evidence',x.evidence,'status',x.status,'owner_note',x.owner_note) order by x.created_at desc),'[]'::jsonb) into calibrations
    from public.sales_360_calibrations x join public.sales_360_results r on r.id=x.result_id join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id;
  elsif actor_profile.role='sales_manager' then
    select coalesce(jsonb_agg(jsonb_build_object('calibration_id',x.id,'result_id',x.result_id,'sales_name',s.full_name,'team',s.team,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'original_total_score',x.original_total_score,'proposed_total_score',x.proposed_total_score,'reason',x.reason,'evidence',x.evidence,'status',x.status,'owner_note',x.owner_note) order by x.created_at desc),'[]'::jsonb) into calibrations
    from public.sales_360_calibrations x join public.sales_360_results r on r.id=x.result_id join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id where x.requested_by=actor and private.crm_manager_covers_user(actor,s.id);
  else calibrations:='[]'::jsonb; end if;

  if actor_profile.role='owner' then
    select coalesce(jsonb_agg(jsonb_build_object('appeal_id',a.id,'result_id',a.result_id,'sales_name',s.full_name,'team',s.team,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'reason',a.reason,'evidence',a.evidence,'status',a.status,'manager_recommendation',a.manager_recommendation,'manager_note',a.manager_note,'owner_note',a.owner_note,'total_score',r.total_score) order by a.created_at desc),'[]'::jsonb) into appeals
    from public.sales_360_appeals a join public.sales_360_results r on r.id=a.result_id join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id;
  elsif actor_profile.role='sales_manager' then
    select coalesce(jsonb_agg(jsonb_build_object('appeal_id',a.id,'result_id',a.result_id,'sales_name',s.full_name,'team',s.team,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'reason',a.reason,'evidence',a.evidence,'status',a.status,'manager_recommendation',a.manager_recommendation,'manager_note',a.manager_note,'owner_note',a.owner_note,'total_score',r.total_score) order by a.created_at desc),'[]'::jsonb) into appeals
    from public.sales_360_appeals a join public.sales_360_results r on r.id=a.result_id join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id where private.crm_manager_covers_user(actor,s.id);
  elsif actor_profile.role='sales' then
    select coalesce(jsonb_agg(jsonb_build_object('appeal_id',a.id,'result_id',a.result_id,'sales_name',actor_profile.full_name,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'reason',a.reason,'evidence',a.evidence,'status',a.status,'manager_recommendation',a.manager_recommendation,'manager_note',a.manager_note,'owner_note',a.owner_note,'total_score',r.total_score) order by a.created_at desc),'[]'::jsonb) into appeals
    from public.sales_360_appeals a join public.sales_360_results r on r.id=a.result_id join public.sales_360_cycles c on c.id=r.cycle_id where a.appellant_id=actor;
  else appeals:='[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'period_start',c.period_start,'period_end',c.period_end,'status',c.status,'shadow_mode',c.shadow_mode,'formula_version',c.formula_version,'evaluation_due_at',c.evaluation_due_at,'appeal_due_at',c.appeal_due_at) order by c.period_start desc),'[]'::jsonb) into cycles from public.sales_360_cycles c;
  return jsonb_build_object('role',actor_profile.role,'tasks',tasks,'own_results',own_results,'visible_results',visible_results,'cycles',cycles,'calibrations',calibrations,'appeals',appeals);
end $function$;

do $$ begin
 if md5(pg_get_functiondef('public.submit_direct_sales_360_evaluation(uuid,date,jsonb,text,text)'::regprocedure)) <> 'd3a90ac321e2785007770dba49f7d476' then raise exception '评分函数submit_direct_sales_360_evaluation已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.submit_direct_sales_360_evaluation(target_sales_id uuid, target_period_start date, target_scores jsonb, target_summary text DEFAULT NULL::text, target_evidence text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor public.profiles; subject public.profiles; cycle public.sales_360_cycles;
  result_id uuid; assignment_id uuid; selected_evaluator uuid; evaluator record;
  group_name text; result jsonb; month_end date;
begin
  if target_period_start < date '2026-07-01' then raise exception '成员评价从2026年第三季度开始'; end if;
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
  if actor.role='sales_manager' and not private.sales360_can_evaluate(actor.id,subject.id) then
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
  if group_name<>'manager' and exists(select 1 from public.sales_360_evaluation_assignments a where a.cycle_id=cycle.id and a.subject_id=subject.id
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
      and data_environment='production' and private.crm_manager_covers(id,subject.team) order by id limit 1;
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
end $function$;

do $$ begin
 if md5(pg_get_functiondef('public.submit_sales_360_evaluation(uuid,jsonb,text,text)'::regprocedure)) <> '5c399239451a64461f9084e3acf09002' then raise exception '评分函数submit_sales_360_evaluation已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.submit_sales_360_evaluation(target_assignment_id uuid, target_scores jsonb, target_summary text DEFAULT NULL::text, target_evidence text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); task public.sales_360_evaluation_assignments; cycle public.sales_360_cycles;
  required_dimensions text[]; dimension text; score_value numeric; total numeric:=0; score_count integer:=0; overall numeric; response_id uuid; extreme boolean:=false;
begin
  select * into task from public.sales_360_evaluation_assignments where id=target_assignment_id for update;
  if actor is null or task.id is null or task.evaluator_id is distinct from actor then raise exception '评价任务不存在或不属于当前账号'; end if;
  if task.evaluator_group='manager' and not private.sales360_can_evaluate(actor,task.subject_id) then raise exception '该评分对象已不在主管授权团队范围内'; end if;
  select * into cycle from public.sales_360_cycles where id=task.cycle_id;
  if cycle.period_start < date '2026-07-01' then raise exception '成员评价从2026年第三季度开始'; end if;
  if cycle.status<>'collecting' or task.status<>'pending' or clock_timestamp()>task.due_at then raise exception '该评价任务已经截止或完成'; end if;
  if jsonb_typeof(coalesce(target_scores,'null'::jsonb))<>'object' then raise exception '请提交完整的维度评分'; end if;
  required_dimensions:=private.sales_360_dimensions(task.evaluator_group);
  foreach dimension in array required_dimensions loop
    if not target_scores ? dimension or jsonb_typeof(target_scores->dimension)<>'number' then raise exception '缺少评分维度：%',dimension; end if;
    score_value:=(target_scores->>dimension)::numeric;
    if score_value<1 or score_value>5 or score_value<>trunc(score_value) then raise exception '评分必须是 1 到 5 的整数'; end if;
    total:=total+score_value; score_count:=score_count+1;
    if score_value in (1,2,5) then extreme:=true; end if;
  end loop;
  if extreme and char_length(btrim(coalesce(target_evidence,'')))<8 then raise exception '评分为 1、2 或 5 时必须填写具体事实依据'; end if;
  overall:=round(total/greatest(score_count,1),2);
  insert into public.sales_360_evaluation_responses(assignment_id,dimension_scores,overall_score,summary,evidence)
  values(task.id,target_scores,overall,nullif(btrim(target_summary),''),nullif(btrim(target_evidence),'')) returning id into response_id;
  update public.sales_360_evaluation_assignments set status='submitted',submitted_at=clock_timestamp() where id=task.id;
  insert into public.sales_360_events(cycle_id,result_id,actor_id,event_type,after_data,reason)
  values(task.cycle_id,task.result_id,null,'evaluation_submitted',jsonb_build_object('assignment_id',task.id,'response_id',response_id,'evaluator_group',task.evaluator_group),'提交匿名 360 评价');
  return jsonb_build_object('assignment_id',task.id,'status','submitted','overall_score',overall);
end $function$;

-- User confirmed 2026-09-22: Chloe may evaluate both departments (13 current staff).
-- Production application still requires independent review of this exact grant.
do $$ begin
 if not exists(select 1 from public.profiles where id='c43bd3c2-6e3a-4228-99c7-dc95f33643f2'
 and full_name='李铧燕' and active and role='sales_manager' and not is_test_data and data_environment='production')
 then raise exception 'Chloe账号状态与批准目标不符，请重新复核'; end if;
end $$;
insert into private.sales360_evaluator_teams(evaluator_id,team,reason,approval_reference) values
 ('c43bd3c2-6e3a-4228-99c7-dc95f33643f2','海外业务部','用户要求Chloe独立评价两个部门全部成员，不增加客户权限','2026-09-22 用户确认两个部门全部13人；生产须独立复核'),
 ('c43bd3c2-6e3a-4228-99c7-dc95f33643f2','海外工程部','用户要求Chloe独立评价两个部门全部成员，不增加客户权限','2026-09-22 用户确认两个部门全部13人；生产须独立复核');
notify pgrst,'reload schema';
commit;
