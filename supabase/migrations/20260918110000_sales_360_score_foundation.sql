-- Sales 360 scoring foundation. The first production cycle must remain shadow-only.

create table if not exists public.sales_360_cycles (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'collecting'
    check (status in ('collecting','calibration','locked','appeal','closed')),
  shadow_mode boolean not null default true,
  formula_version text not null default 'sales-360-v1',
  evaluation_due_at timestamptz not null,
  appeal_due_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  locked_at timestamptz,
  check (period_end>=period_start),
  unique(period_start,period_end)
);

create table if not exists public.sales_360_results (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.sales_360_cycles(id) on delete cascade,
  sales_id uuid not null references public.profiles(id),
  objective_score numeric(6,2) check (objective_score between 0 and 60),
  multirater_score numeric(6,2) check (multirater_score between 0 and 40),
  total_score numeric(6,2) check (total_score between 0 and 100),
  grade text check (grade is null or grade in ('S','A','B','C','D')),
  bonus_multiplier numeric(4,2) check (bonus_multiplier is null or bonus_multiplier in (0,0.7,1,1.2,1.5)),
  state text not null default 'collecting'
    check (state in ('collecting','provisional','calibration','locked','appeal','adjusted','closed')),
  objective_metrics jsonb not null default '{}'::jsonb,
  multirater_summary jsonb not null default '{}'::jsonb,
  strengths text[] not null default '{}',
  improvement_areas text[] not null default '{}',
  training_plan text,
  new_hire_protected boolean not null default false,
  minimum_sample_met boolean not null default false,
  veto_status text not null default 'none' check (veto_status in ('none','investigating','confirmed','rejected')),
  calibration_adjustment numeric(6,2) not null default 0 check (calibration_adjustment between -10 and 10),
  calibration_note text,
  locked_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique(cycle_id,sales_id)
);

create table if not exists public.sales_360_goals (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null unique references public.sales_360_results(id) on delete cascade,
  target_won_amount_cny numeric(18,2) not null check (target_won_amount_cny>0),
  monthly_bonus_base numeric(18,2) not null default 0 check (monthly_bonus_base>=0),
  target_note text,
  set_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.sales_360_evaluation_assignments (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.sales_360_cycles(id) on delete cascade,
  result_id uuid not null references public.sales_360_results(id) on delete cascade,
  subject_id uuid not null references public.profiles(id),
  evaluator_id uuid not null references public.profiles(id),
  evaluator_group text not null check (evaluator_group in ('owner','manager','peer','marketing','self')),
  status text not null default 'pending' check (status in ('pending','submitted','void')),
  due_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  submitted_at timestamptz,
  unique(cycle_id,subject_id,evaluator_id,evaluator_group),
  check ((evaluator_group='self' and evaluator_id=subject_id) or evaluator_group<>'self')
);

create table if not exists public.sales_360_evaluation_responses (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.sales_360_evaluation_assignments(id) on delete restrict,
  dimension_scores jsonb not null,
  overall_score numeric(4,2) not null check (overall_score between 1 and 5),
  summary text,
  evidence text,
  submitted_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(dimension_scores)='object')
);

create table if not exists public.sales_360_appeals (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.sales_360_results(id) on delete restrict,
  appellant_id uuid not null references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 8 and 4000),
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'pending_manager'
    check (status in ('pending_manager','pending_owner','approved','rejected','withdrawn')),
  manager_id uuid references public.profiles(id),
  manager_recommendation text check (manager_recommendation is null or manager_recommendation in ('approve','reject')),
  manager_note text,
  manager_reviewed_at timestamptz,
  owner_id uuid references public.profiles(id),
  owner_note text,
  owner_reviewed_at timestamptz,
  requested_total_score numeric(6,2) check (requested_total_score is null or requested_total_score between 0 and 100),
  created_at timestamptz not null default clock_timestamp(),
  unique(result_id,appellant_id)
);

create table if not exists public.sales_360_calibrations (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null unique references public.sales_360_results(id) on delete restrict,
  requested_by uuid not null references public.profiles(id),
  original_total_score numeric(6,2) not null check (original_total_score between 0 and 100),
  proposed_total_score numeric(6,2) not null check (proposed_total_score between 0 and 100),
  reason text not null check (char_length(btrim(reason)) between 8 and 4000),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence)='array'),
  status text not null default 'pending_owner' check (status in ('pending_owner','approved','rejected')),
  owner_id uuid references public.profiles(id),
  owner_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.sales_360_events (
  id bigint generated always as identity primary key,
  cycle_id uuid references public.sales_360_cycles(id) on delete cascade,
  result_id uuid references public.sales_360_results(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists sales_360_results_sales_cycle_idx on public.sales_360_results(sales_id,cycle_id);
create index if not exists sales_360_assignments_evaluator_status_idx on public.sales_360_evaluation_assignments(evaluator_id,status,due_at);
create index if not exists sales_360_assignments_subject_group_idx on public.sales_360_evaluation_assignments(subject_id,evaluator_group,status);
create index if not exists sales_360_appeals_status_idx on public.sales_360_appeals(status,created_at);
create index if not exists sales_360_calibrations_status_idx on public.sales_360_calibrations(status,created_at);

alter table public.sales_360_cycles enable row level security;
alter table public.sales_360_results enable row level security;
alter table public.sales_360_goals enable row level security;
alter table public.sales_360_evaluation_assignments enable row level security;
alter table public.sales_360_evaluation_responses enable row level security;
alter table public.sales_360_appeals enable row level security;
alter table public.sales_360_calibrations enable row level security;
alter table public.sales_360_events enable row level security;

drop policy if exists sales_360_cycles_read on public.sales_360_cycles;
create policy sales_360_cycles_read on public.sales_360_cycles for select to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active=true));

drop policy if exists sales_360_results_read on public.sales_360_results;
create policy sales_360_results_read on public.sales_360_results for select to authenticated
using (
  sales_id=(select auth.uid())
  or private.current_crm_role()='owner'
  or (
    private.current_crm_role()='sales_manager'
    and exists(
      select 1 from public.profiles viewer,public.profiles subject
      where viewer.id=(select auth.uid()) and subject.id=sales_id
        and viewer.active=true and subject.active=true and viewer.team is not distinct from subject.team
    )
  )
);

drop policy if exists sales_360_goals_read on public.sales_360_goals;
create policy sales_360_goals_read on public.sales_360_goals for select to authenticated
using (exists(select 1 from public.sales_360_results r where r.id=result_id));

drop policy if exists sales_360_assignments_read on public.sales_360_evaluation_assignments;
create policy sales_360_assignments_read on public.sales_360_evaluation_assignments for select to authenticated
using (evaluator_id=(select auth.uid()));

drop policy if exists sales_360_responses_read on public.sales_360_evaluation_responses;
create policy sales_360_responses_read on public.sales_360_evaluation_responses for select to authenticated
using (exists(select 1 from public.sales_360_evaluation_assignments a where a.id=assignment_id and a.evaluator_id=(select auth.uid())));

drop policy if exists sales_360_appeals_read on public.sales_360_appeals;
create policy sales_360_appeals_read on public.sales_360_appeals for select to authenticated
using (
  appellant_id=(select auth.uid())
  or private.current_crm_role()='owner'
  or (
    private.current_crm_role()='sales_manager'
    and exists(
      select 1 from public.sales_360_results r
      join public.profiles subject on subject.id=r.sales_id
      join public.profiles viewer on viewer.id=(select auth.uid())
      where r.id=result_id and viewer.team is not distinct from subject.team
    )
  )
);

drop policy if exists sales_360_events_read on public.sales_360_events;
create policy sales_360_events_read on public.sales_360_events for select to authenticated
using (private.current_crm_role()='owner' or actor_id=(select auth.uid()));

drop policy if exists sales_360_calibrations_read on public.sales_360_calibrations;
create policy sales_360_calibrations_read on public.sales_360_calibrations for select to authenticated
using (
  private.current_crm_role()='owner' or requested_by=(select auth.uid())
  or exists(select 1 from public.sales_360_results r where r.id=result_id and r.sales_id=(select auth.uid()))
);

revoke all on public.sales_360_cycles,public.sales_360_results,public.sales_360_goals,
  public.sales_360_evaluation_assignments,public.sales_360_evaluation_responses,
  public.sales_360_appeals,public.sales_360_calibrations,public.sales_360_events from anon,authenticated;
grant select on public.sales_360_cycles,public.sales_360_results,public.sales_360_goals,
  public.sales_360_evaluation_assignments,public.sales_360_evaluation_responses,
  public.sales_360_appeals,public.sales_360_calibrations,public.sales_360_events to authenticated;
grant all on public.sales_360_cycles,public.sales_360_results,public.sales_360_goals,
  public.sales_360_evaluation_assignments,public.sales_360_evaluation_responses,
  public.sales_360_appeals,public.sales_360_calibrations,public.sales_360_events to service_role;

create or replace function private.sales_360_dimensions(group_name text)
returns text[] language sql immutable set search_path='' as $$
  select case group_name
    when 'owner' then array['performance_contribution','values','responsibility']
    when 'manager' then array['execution','professionalism','goal_delivery','growth']
    when 'peer' then array['collaboration','responsiveness','knowledge_sharing']
    when 'marketing' then array['lead_feedback_quality','handoff_collaboration','recycle_evidence']
    when 'self' then array['goal_review','problem_identification','improvement_plan']
    else array[]::text[] end
$$;
revoke all on function private.sales_360_dimensions(text) from public,anon,authenticated;

create or replace function public.create_sales_360_cycle(target_period_start date,shadow_run boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); actor_role public.crm_role; cycle_id uuid; result_id uuid;
  period_end date; due_at timestamptz; subject record; evaluator record; manager_id uuid;
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor_role<>'owner' then raise exception '仅老板可以创建 360 评分周期'; end if;
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

  for subject in select p.id,p.team from public.profiles p where p.role='sales' and p.active=true order by p.id loop
    insert into public.sales_360_results(cycle_id,sales_id,state)
    values(cycle_id,subject.id,'collecting') returning id into result_id;

    insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
    values(cycle_id,result_id,subject.id,subject.id,'self',due_at);
    insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
    values(cycle_id,result_id,subject.id,actor,'owner',due_at);

    select p.id into manager_id from public.profiles p
    where p.role='sales_manager' and p.active=true and p.team is not distinct from subject.team
    order by p.id limit 1;
    if manager_id is null then
      select p.id into manager_id from public.profiles p where p.role='sales_manager' and p.active=true order by p.id limit 1;
    end if;
    if manager_id is not null then
      insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
      values(cycle_id,result_id,subject.id,manager_id,'manager',due_at);
    end if;

    for evaluator in select p.id from public.profiles p
      where p.role='sales' and p.active=true and p.id<>subject.id and p.team is not distinct from subject.team
      order by md5(cycle_id::text||subject.id::text||p.id::text) limit 5
    loop
      insert into public.sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at)
      values(cycle_id,result_id,subject.id,evaluator.id,'peer',due_at);
    end loop;

    for evaluator in select p.id from public.profiles p where p.role='marketing' and p.active=true
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
end $$;

create or replace function public.set_sales_360_goal(
  target_result_id uuid,target_won_amount_cny numeric,target_bonus_base numeric,
  protect_new_hire boolean default false,target_note text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.crm_role; item public.sales_360_results; old_goal jsonb; saved public.sales_360_goals;
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  select * into item from public.sales_360_results where id=target_result_id for update;
  if item.id is null then raise exception '评分结果不存在'; end if;
  if actor_role not in ('owner','sales_manager') then raise exception '仅老板或销售主管可设置目标'; end if;
  if actor_role='sales_manager' and not exists(
    select 1 from public.profiles viewer,public.profiles subject
    where viewer.id=actor and subject.id=item.sales_id and viewer.team is not distinct from subject.team
  ) then raise exception '只能设置本团队业务员目标'; end if;
  if target_won_amount_cny is null or target_won_amount_cny<=0 or target_bonus_base is null or target_bonus_base<0 then raise exception '目标和奖金基数不正确'; end if;
  select to_jsonb(g) into old_goal from public.sales_360_goals g where g.result_id=item.id;
  insert into public.sales_360_goals(result_id,target_won_amount_cny,monthly_bonus_base,target_note,set_by)
  values(item.id,target_won_amount_cny,target_bonus_base,nullif(btrim(target_note),''),actor)
  on conflict(result_id) do update set target_won_amount_cny=excluded.target_won_amount_cny,
    monthly_bonus_base=excluded.monthly_bonus_base,target_note=excluded.target_note,set_by=actor,updated_at=clock_timestamp()
  returning * into saved;
  update public.sales_360_results set new_hire_protected=coalesce(protect_new_hire,false),updated_at=clock_timestamp() where id=item.id;
  insert into public.sales_360_events(cycle_id,result_id,actor_id,event_type,before_data,after_data,reason)
  values(item.cycle_id,item.id,actor,'goal_set',coalesce(old_goal,'{}'::jsonb),to_jsonb(saved),coalesce(nullif(btrim(target_note),''),'设置月度目标和奖金基数'));
  return jsonb_build_object('result_id',item.id,'target_won_amount_cny',saved.target_won_amount_cny,'monthly_bonus_base',saved.monthly_bonus_base,'new_hire_protected',coalesce(protect_new_hire,false));
end $$;

create or replace function public.submit_sales_360_evaluation(
  target_assignment_id uuid,target_scores jsonb,target_summary text default null,target_evidence text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); task public.sales_360_evaluation_assignments; cycle public.sales_360_cycles;
  required_dimensions text[]; dimension text; score_value numeric; total numeric:=0; score_count integer:=0; overall numeric; response_id uuid; extreme boolean:=false;
begin
  select * into task from public.sales_360_evaluation_assignments where id=target_assignment_id for update;
  if task.id is null or task.evaluator_id<>actor then raise exception '评价任务不存在或不属于当前账号'; end if;
  select * into cycle from public.sales_360_cycles where id=task.cycle_id;
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
end $$;

create or replace function public.submit_sales_360_appeal(target_result_id uuid,appeal_reason text,appeal_evidence jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.sales_360_results; cycle public.sales_360_cycles; appeal_id uuid;
begin
  select * into item from public.sales_360_results where id=target_result_id for update;
  if item.id is null or item.sales_id<>actor then raise exception '只能申诉本人的评分结果'; end if;
  select * into cycle from public.sales_360_cycles where id=item.cycle_id;
  if cycle.status not in ('locked','appeal') or cycle.appeal_due_at is null or clock_timestamp()>cycle.appeal_due_at then raise exception '当前不在申诉期'; end if;
  if char_length(btrim(coalesce(appeal_reason,'')))<8 then raise exception '请完整填写申诉理由'; end if;
  if jsonb_typeof(coalesce(appeal_evidence,'[]'::jsonb))<>'array' then raise exception '申诉证据格式不正确'; end if;
  insert into public.sales_360_appeals(result_id,appellant_id,reason,evidence)
  values(item.id,actor,btrim(appeal_reason),appeal_evidence) returning id into appeal_id;
  update public.sales_360_results set state='appeal',updated_at=clock_timestamp() where id=item.id;
  insert into public.sales_360_events(cycle_id,result_id,actor_id,event_type,after_data,reason)
  values(item.cycle_id,item.id,actor,'appeal_submitted',jsonb_build_object('appeal_id',appeal_id),btrim(appeal_reason));
  return appeal_id;
end $$;

create or replace function public.calculate_sales_360_cycle(target_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); actor_role public.crm_role; cycle public.sales_360_cycles; item record;
  inquiry_count integer; won_cny numeric; response_total integer; response_met integer;
  follow_total integer; follow_met integer; quote_total integer; quote_met integer;
  reply_total integer; reply_met integer; qualification_average numeric; completeness_average numeric;
  objective_without_relative numeric; objective_total numeric; subjective_total numeric;
  owner_avg numeric; manager_avg numeric; peer_avg numeric; marketing_avg numeric; self_avg numeric;
  owner_count integer; manager_count integer; peer_count integer; marketing_count integer; self_count integer;
  manager_weight numeric; result_count integer:=0;
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor_role<>'owner' then raise exception '仅老板可以计算评分周期'; end if;
  select * into cycle from public.sales_360_cycles where id=target_cycle_id for update;
  if cycle.id is null then raise exception '评分周期不存在'; end if;
  if cycle.status not in ('collecting','calibration') then raise exception '当前周期不能重新计算'; end if;
  if exists(select 1 from public.sales_360_evaluation_assignments a where a.cycle_id=cycle.id and a.status='pending') then
    raise exception '仍有匿名评价任务未完成，暂不能计算结果';
  end if;
  if exists(select 1 from public.sales_360_results r left join public.sales_360_goals g on g.result_id=r.id where r.cycle_id=cycle.id and g.id is null) then
    raise exception '请先为所有业务员设置月度目标和奖金基数';
  end if;

  for item in select r.id,r.sales_id,g.target_won_amount_cny from public.sales_360_results r join public.sales_360_goals g on g.result_id=r.id where r.cycle_id=cycle.id order by r.id loop
    select count(*) filter(where coalesce(i.assigned_at,i.created_at)::date between cycle.period_start and cycle.period_end),coalesce(sum(case when i.status='won' and i.won_at::date between cycle.period_start and cycle.period_end then i.won_amount*coalesce(i.won_exchange_rate,1) else 0 end),0),
      count(*) filter(where i.assigned_at::date between cycle.period_start and cycle.period_end),count(*) filter(where i.assigned_at::date between cycle.period_start and cycle.period_end and i.first_valid_contact_at<=i.assigned_at+interval '30 minutes'),
      count(*) filter(where i.assigned_at::date between cycle.period_start and cycle.period_end),count(*) filter(where i.assigned_at::date between cycle.period_start and cycle.period_end and i.quoted_at is not null and i.quoted_at<=i.assigned_at+interval '3 days'),
      coalesce(avg(coalesce(i.qualification_score,0)) filter(where coalesce(i.assigned_at,i.created_at)::date between cycle.period_start and cycle.period_end),0),
      coalesce(avg((
        (case when nullif(btrim(i.target_country),'') is not null then 1 else 0 end)+
        (case when nullif(btrim(i.product_category),'') is not null then 1 else 0 end)+
        (case when nullif(btrim(i.quantity),'') is not null then 1 else 0 end)+
        (case when i.estimated_amount is not null and i.estimated_amount>0 then 1 else 0 end)+
        (case when nullif(btrim(i.contact_job_title),'') is not null then 1 else 0 end)+
        (case when i.status in ('won','lost') or i.next_follow_up_at is not null then 1 else 0 end)
      )::numeric/6) filter(where coalesce(i.assigned_at,i.created_at)::date between cycle.period_start and cycle.period_end),0)
    into inquiry_count,won_cny,response_total,response_met,quote_total,quote_met,qualification_average,completeness_average
    from public.inquiries i
    where i.owner_id=item.sales_id and coalesce(i.excluded_from_dashboard,false)=false
      and i.validity='valid' and (
        coalesce(i.assigned_at,i.created_at)::date between cycle.period_start and cycle.period_end
        or (i.status='won' and i.won_at::date between cycle.period_start and cycle.period_end)
      );

    select count(*),count(*) filter(where f.completion_status='on_time') into follow_total,follow_met
    from public.follow_ups f where f.author_id=item.sales_id and f.is_task=true
      and coalesce(f.original_due_at,f.next_follow_up_at)::date between cycle.period_start and cycle.period_end;
    select count(*),count(*) filter(where e.status='replied' and e.replied_at<=e.received_at+interval '24 hours') into reply_total,reply_met
    from public.email_reply_reminders e where e.owner_id=item.sales_id and e.received_at::date between cycle.period_start and cycle.period_end;

    objective_without_relative:=
      least(won_cny/item.target_won_amount_cny,1)*18+
      (case when response_total=0 then 6 else response_met::numeric/response_total*6 end)+
      (case when follow_total=0 then 6 else follow_met::numeric/follow_total*6 end)+
      (case when quote_total=0 then 4 else quote_met::numeric/quote_total*4 end)+
      (case when reply_total=0 then 4 else reply_met::numeric/reply_total*4 end)+
      least(qualification_average/100,1)*10+
      least(completeness_average,1)*5;

    select coalesce(avg(x.overall_score) filter(where x.evaluator_group='owner'),0),count(*) filter(where x.evaluator_group='owner'),
      coalesce(avg(x.overall_score) filter(where x.evaluator_group='manager'),0),count(*) filter(where x.evaluator_group='manager'),
      coalesce(avg(x.overall_score) filter(where x.evaluator_group='peer'),0),count(*) filter(where x.evaluator_group='peer'),
      coalesce(avg(x.overall_score) filter(where x.evaluator_group='marketing'),0),count(*) filter(where x.evaluator_group='marketing'),
      coalesce(avg(x.overall_score) filter(where x.evaluator_group='self'),0),count(*) filter(where x.evaluator_group='self')
    into owner_avg,owner_count,manager_avg,manager_count,peer_avg,peer_count,marketing_avg,marketing_count,self_avg,self_count
    from (
      select a.evaluator_group,r.overall_score from public.sales_360_evaluation_assignments a
      join public.sales_360_evaluation_responses r on r.assignment_id=a.id where a.result_id=item.id
    ) x;
    if owner_count=0 or manager_count=0 or self_count=0 then raise exception '业务员 % 的老板、主管或自评任务不完整',item.sales_id; end if;
    manager_weight:=14+(case when peer_count<3 then 6 else 0 end)+(case when marketing_count<3 then 5 else 0 end);
    subjective_total:=owner_avg/5*12+manager_avg/5*manager_weight+self_avg/5*3+
      (case when peer_count>=3 then peer_avg/5*6 else 0 end)+
      (case when marketing_count>=3 then marketing_avg/5*5 else 0 end);

    update public.sales_360_results set
      objective_score=round(objective_without_relative,2),multirater_score=round(subjective_total,2),state='provisional',
      minimum_sample_met=inquiry_count>=5,
      objective_metrics=jsonb_build_object('inquiry_count',inquiry_count,'won_amount_cny',round(won_cny,2),'goal_achievement',round(won_cny/item.target_won_amount_cny,4),'first_response_total',response_total,'first_response_met',response_met,'follow_up_total',follow_total,'follow_up_on_time',follow_met,'quotation_total',quote_total,'quotation_timely',quote_met,'reply_total',reply_total,'reply_within_24h',reply_met,'qualification_average',round(qualification_average,2),'data_completeness',round(completeness_average,4),'relative_performance_pending',true),
      multirater_summary=jsonb_build_object('owner_average',round(owner_avg,2),'manager_average',round(manager_avg,2),'peer_average',case when peer_count>=3 then round(peer_avg,2) else null end,'peer_count',peer_count,'marketing_average',case when marketing_count>=3 then round(marketing_avg,2) else null end,'marketing_count',marketing_count,'self_average',round(self_avg,2),'manager_weight_after_sample_transfer',manager_weight),updated_at=clock_timestamp()
    where id=item.id;
    result_count:=result_count+1;
  end loop;

  with ranked as (
    select r.id,r.objective_score,(r.objective_metrics->>'won_amount_cny')::numeric as won_cny,
      case when count(*) over()=1 then 1 else percent_rank() over(order by (r.objective_metrics->>'won_amount_cny')::numeric) end as relative_rank
    from public.sales_360_results r where r.cycle_id=cycle.id
  )
  update public.sales_360_results r set
    objective_score=round(least(60,ranked.objective_score+ranked.relative_rank*7),2),
    total_score=round(least(100,ranked.objective_score+ranked.relative_rank*7+r.multirater_score),2),
    objective_metrics=r.objective_metrics||jsonb_build_object('relative_performance_points',round(ranked.relative_rank*7,2),'relative_performance_pending',false),updated_at=clock_timestamp()
  from ranked where r.id=ranked.id;

  update public.sales_360_results set
    grade=case when total_score>=90 then 'S' when total_score>=80 then 'A' when total_score>=70 then 'B' when total_score>=60 then 'C' else 'D' end,
    bonus_multiplier=case when total_score>=90 then 1.5 when total_score>=80 then 1.2 when total_score>=70 then 1 when total_score>=60 then 0.7 else 0 end,
    state='calibration',updated_at=clock_timestamp()
  where cycle_id=cycle.id;
  update public.sales_360_cycles set status='calibration' where id=cycle.id;
  insert into public.sales_360_events(cycle_id,actor_id,event_type,after_data,reason)
  values(cycle.id,actor,'cycle_calculated',jsonb_build_object('result_count',result_count,'formula_version',cycle.formula_version),'生成影子评分并进入校准');
  return jsonb_build_object('cycle_id',cycle.id,'status','calibration','result_count',result_count);
end $$;

create or replace function public.lock_sales_360_cycle(target_cycle_id uuid,lock_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.crm_role; cycle public.sales_360_cycles; due_at timestamptz:=clock_timestamp()+interval '3 days';
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor_role<>'owner' then raise exception '仅老板可以锁定并发布评分'; end if;
  if char_length(btrim(coalesce(lock_reason,'')))<8 then raise exception '请填写至少 8 个字的发布依据'; end if;
  select * into cycle from public.sales_360_cycles where id=target_cycle_id for update;
  if cycle.id is null or cycle.status<>'calibration' then raise exception '评分周期尚未完成计算和校准'; end if;
  if exists(
    select 1 from public.sales_360_calibrations x
    join public.sales_360_results r on r.id=x.result_id
    where r.cycle_id=cycle.id and x.status='pending_owner'
  ) then raise exception '仍有主管校准建议待老板审核，不能锁定发布'; end if;
  update public.sales_360_cycles set status='appeal',locked_at=clock_timestamp(),appeal_due_at=due_at where id=cycle.id;
  update public.sales_360_results set state='locked',locked_at=clock_timestamp(),updated_at=clock_timestamp() where cycle_id=cycle.id;
  insert into public.sales_360_events(cycle_id,actor_id,event_type,after_data,reason)
  values(cycle.id,actor,'cycle_locked',jsonb_build_object('appeal_due_at',due_at,'shadow_mode',cycle.shadow_mode),btrim(lock_reason));
  return jsonb_build_object('cycle_id',cycle.id,'status','appeal','appeal_due_at',due_at,'shadow_mode',cycle.shadow_mode);
end $$;

create or replace function public.submit_sales_360_calibration(
  target_result_id uuid,proposed_total_score numeric,calibration_reason text,calibration_evidence jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_profile public.profiles; item public.sales_360_results; subject public.profiles; calibration_id uuid;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor_profile.role<>'sales_manager' then raise exception '仅直属销售主管可以提交校准建议'; end if;
  select * into item from public.sales_360_results where id=target_result_id for update;
  if item.id is null or item.state<>'calibration' or item.total_score is null then raise exception '评分结果尚未进入校准阶段'; end if;
  select * into subject from public.profiles where id=item.sales_id and active=true;
  if subject.id is null or actor_profile.team is distinct from subject.team then raise exception '只能校准本团队业务员'; end if;
  if proposed_total_score is null or proposed_total_score<0 or proposed_total_score>100 or abs(proposed_total_score-item.total_score)>10 then raise exception '校准建议必须在原总分上下 10 分以内'; end if;
  if char_length(btrim(coalesce(calibration_reason,'')))<8 then raise exception '请填写至少 8 个字的校准依据'; end if;
  if jsonb_typeof(coalesce(calibration_evidence,'[]'::jsonb))<>'array' then raise exception '校准证据格式不正确'; end if;
  insert into public.sales_360_calibrations(result_id,requested_by,original_total_score,proposed_total_score,reason,evidence)
  values(item.id,actor,item.total_score,proposed_total_score,btrim(calibration_reason),calibration_evidence)
  on conflict(result_id) do update set requested_by=actor,original_total_score=item.total_score,proposed_total_score=excluded.proposed_total_score,reason=excluded.reason,evidence=excluded.evidence,status='pending_owner',owner_id=null,owner_note=null,reviewed_at=null,created_at=clock_timestamp()
  returning id into calibration_id;
  insert into public.sales_360_events(cycle_id,result_id,actor_id,event_type,before_data,after_data,reason)
  values(item.cycle_id,item.id,actor,'calibration_proposed',jsonb_build_object('total_score',item.total_score),jsonb_build_object('calibration_id',calibration_id,'proposed_total_score',proposed_total_score),btrim(calibration_reason));
  return calibration_id;
end $$;

create or replace function public.review_sales_360_calibration(target_calibration_id uuid,approve boolean,review_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.crm_role; proposal public.sales_360_calibrations; item public.sales_360_results; adjustment numeric;
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor_role<>'owner' then raise exception '仅老板可以审核校准建议'; end if;
  if char_length(btrim(coalesce(review_note,'')))<8 then raise exception '请填写至少 8 个字的审核依据'; end if;
  select * into proposal from public.sales_360_calibrations where id=target_calibration_id for update;
  if proposal.id is null or proposal.status<>'pending_owner' then raise exception '校准建议不存在或已审核'; end if;
  select * into item from public.sales_360_results where id=proposal.result_id for update;
  if item.id is null or item.state<>'calibration' then raise exception '评分结果不在校准阶段'; end if;
  adjustment:=proposal.proposed_total_score-proposal.original_total_score;
  update public.sales_360_calibrations set status=case when approve then 'approved' else 'rejected' end,owner_id=actor,owner_note=btrim(review_note),reviewed_at=clock_timestamp() where id=proposal.id;
  if approve then
    update public.sales_360_results set total_score=proposal.proposed_total_score,calibration_adjustment=adjustment,calibration_note=btrim(review_note),
      grade=case when proposal.proposed_total_score>=90 then 'S' when proposal.proposed_total_score>=80 then 'A' when proposal.proposed_total_score>=70 then 'B' when proposal.proposed_total_score>=60 then 'C' else 'D' end,
      bonus_multiplier=case when proposal.proposed_total_score>=90 then 1.5 when proposal.proposed_total_score>=80 then 1.2 when proposal.proposed_total_score>=70 then 1 when proposal.proposed_total_score>=60 then 0.7 else 0 end,updated_at=clock_timestamp()
    where id=item.id;
  end if;
  insert into public.sales_360_events(cycle_id,result_id,actor_id,event_type,before_data,after_data,reason)
  values(item.cycle_id,item.id,actor,case when approve then 'calibration_approved' else 'calibration_rejected' end,jsonb_build_object('total_score',proposal.original_total_score),jsonb_build_object('proposed_total_score',proposal.proposed_total_score,'approved',approve),btrim(review_note));
  return jsonb_build_object('calibration_id',proposal.id,'status',case when approve then 'approved' else 'rejected' end,'total_score',case when approve then proposal.proposed_total_score else item.total_score end);
end $$;

create or replace function public.review_sales_360_appeal(
  target_appeal_id uuid,approve boolean,review_note text,adjusted_total_score numeric default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_profile public.profiles; appeal public.sales_360_appeals; item public.sales_360_results; subject public.profiles; next_status text;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor_profile.role not in ('owner','sales_manager') then raise exception '当前角色不能审核评分申诉'; end if;
  if char_length(btrim(coalesce(review_note,'')))<8 then raise exception '请填写至少 8 个字的审核依据'; end if;
  select * into appeal from public.sales_360_appeals where id=target_appeal_id for update;
  if appeal.id is null then raise exception '申诉不存在'; end if;
  select * into item from public.sales_360_results where id=appeal.result_id for update;
  select * into subject from public.profiles where id=item.sales_id;
  if actor_profile.role='sales_manager' then
    if appeal.status<>'pending_manager' then raise exception '该申诉不在主管初审阶段'; end if;
    if actor_profile.team is distinct from subject.team then raise exception '只能初审本团队业务员申诉'; end if;
    update public.sales_360_appeals set status='pending_owner',manager_id=actor,manager_recommendation=case when approve then 'approve' else 'reject' end,manager_note=btrim(review_note),manager_reviewed_at=clock_timestamp() where id=appeal.id;
    next_status:='pending_owner';
  else
    if appeal.status<>'pending_owner' then raise exception '该申诉尚未完成主管初审或已经处理'; end if;
    if approve and adjusted_total_score is not null and (
      adjusted_total_score<0 or adjusted_total_score>100
      or abs(adjusted_total_score-item.total_score)>10
      or abs(item.calibration_adjustment+adjusted_total_score-item.total_score)>10
    ) then raise exception '申诉调整必须在当前分数上下 10 分以内，且累计调整不得超过原始分数上下 10 分'; end if;
    update public.sales_360_appeals set status=case when approve then 'approved' else 'rejected' end,owner_id=actor,owner_note=btrim(review_note),owner_reviewed_at=clock_timestamp(),requested_total_score=case when approve then adjusted_total_score else null end where id=appeal.id;
    if approve then
      update public.sales_360_results set total_score=coalesce(adjusted_total_score,total_score),state='adjusted',calibration_adjustment=calibration_adjustment+coalesce(adjusted_total_score-total_score,0),calibration_note=btrim(review_note),
        grade=case when coalesce(adjusted_total_score,total_score)>=90 then 'S' when coalesce(adjusted_total_score,total_score)>=80 then 'A' when coalesce(adjusted_total_score,total_score)>=70 then 'B' when coalesce(adjusted_total_score,total_score)>=60 then 'C' else 'D' end,
        bonus_multiplier=case when coalesce(adjusted_total_score,total_score)>=90 then 1.5 when coalesce(adjusted_total_score,total_score)>=80 then 1.2 when coalesce(adjusted_total_score,total_score)>=70 then 1 when coalesce(adjusted_total_score,total_score)>=60 then 0.7 else 0 end,updated_at=clock_timestamp() where id=item.id;
    else update public.sales_360_results set state='locked',updated_at=clock_timestamp() where id=item.id; end if;
    next_status:=case when approve then 'approved' else 'rejected' end;
  end if;
  insert into public.sales_360_events(cycle_id,result_id,actor_id,event_type,before_data,after_data,reason)
  values(item.cycle_id,item.id,actor,case when actor_profile.role='sales_manager' then 'appeal_manager_reviewed' else 'appeal_owner_reviewed' end,jsonb_build_object('appeal_status',appeal.status,'total_score',item.total_score),jsonb_build_object('appeal_status',next_status,'recommendation',case when approve then 'approve' else 'reject' end,'adjusted_total_score',adjusted_total_score),btrim(review_note));
  return jsonb_build_object('appeal_id',appeal.id,'status',next_status);
end $$;

create or replace function public.get_my_sales_360_workspace()
returns jsonb language plpgsql security definer stable set search_path='' as $$
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
  where a.evaluator_id=actor and a.status<>'void';

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
    where s.team is not distinct from actor_profile.team;
  else visible_results:='[]'::jsonb; end if;

  if actor_profile.role='owner' then
    select coalesce(jsonb_agg(jsonb_build_object('calibration_id',x.id,'result_id',x.result_id,'sales_name',s.full_name,'team',s.team,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'original_total_score',x.original_total_score,'proposed_total_score',x.proposed_total_score,'reason',x.reason,'evidence',x.evidence,'status',x.status,'owner_note',x.owner_note) order by x.created_at desc),'[]'::jsonb) into calibrations
    from public.sales_360_calibrations x join public.sales_360_results r on r.id=x.result_id join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id;
  elsif actor_profile.role='sales_manager' then
    select coalesce(jsonb_agg(jsonb_build_object('calibration_id',x.id,'result_id',x.result_id,'sales_name',s.full_name,'team',s.team,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'original_total_score',x.original_total_score,'proposed_total_score',x.proposed_total_score,'reason',x.reason,'evidence',x.evidence,'status',x.status,'owner_note',x.owner_note) order by x.created_at desc),'[]'::jsonb) into calibrations
    from public.sales_360_calibrations x join public.sales_360_results r on r.id=x.result_id join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id where x.requested_by=actor;
  else calibrations:='[]'::jsonb; end if;

  if actor_profile.role='owner' then
    select coalesce(jsonb_agg(jsonb_build_object('appeal_id',a.id,'result_id',a.result_id,'sales_name',s.full_name,'team',s.team,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'reason',a.reason,'evidence',a.evidence,'status',a.status,'manager_recommendation',a.manager_recommendation,'manager_note',a.manager_note,'owner_note',a.owner_note,'total_score',r.total_score) order by a.created_at desc),'[]'::jsonb) into appeals
    from public.sales_360_appeals a join public.sales_360_results r on r.id=a.result_id join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id;
  elsif actor_profile.role='sales_manager' then
    select coalesce(jsonb_agg(jsonb_build_object('appeal_id',a.id,'result_id',a.result_id,'sales_name',s.full_name,'team',s.team,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'reason',a.reason,'evidence',a.evidence,'status',a.status,'manager_recommendation',a.manager_recommendation,'manager_note',a.manager_note,'owner_note',a.owner_note,'total_score',r.total_score) order by a.created_at desc),'[]'::jsonb) into appeals
    from public.sales_360_appeals a join public.sales_360_results r on r.id=a.result_id join public.profiles s on s.id=r.sales_id join public.sales_360_cycles c on c.id=r.cycle_id where s.team is not distinct from actor_profile.team;
  elsif actor_profile.role='sales' then
    select coalesce(jsonb_agg(jsonb_build_object('appeal_id',a.id,'result_id',a.result_id,'sales_name',actor_profile.full_name,'period_start',c.period_start,'period_end',c.period_end,'shadow_mode',c.shadow_mode,'reason',a.reason,'evidence',a.evidence,'status',a.status,'manager_recommendation',a.manager_recommendation,'manager_note',a.manager_note,'owner_note',a.owner_note,'total_score',r.total_score) order by a.created_at desc),'[]'::jsonb) into appeals
    from public.sales_360_appeals a join public.sales_360_results r on r.id=a.result_id join public.sales_360_cycles c on c.id=r.cycle_id where a.appellant_id=actor;
  else appeals:='[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'period_start',c.period_start,'period_end',c.period_end,'status',c.status,'shadow_mode',c.shadow_mode,'formula_version',c.formula_version,'evaluation_due_at',c.evaluation_due_at,'appeal_due_at',c.appeal_due_at) order by c.period_start desc),'[]'::jsonb) into cycles from public.sales_360_cycles c;
  return jsonb_build_object('role',actor_profile.role,'tasks',tasks,'own_results',own_results,'visible_results',visible_results,'cycles',cycles,'calibrations',calibrations,'appeals',appeals);
end $$;

revoke all on function public.create_sales_360_cycle(date,boolean) from public,anon;
revoke all on function public.set_sales_360_goal(uuid,numeric,numeric,boolean,text) from public,anon;
revoke all on function public.submit_sales_360_evaluation(uuid,jsonb,text,text) from public,anon;
revoke all on function public.submit_sales_360_appeal(uuid,text,jsonb) from public,anon;
revoke all on function public.get_my_sales_360_workspace() from public,anon;
revoke all on function public.calculate_sales_360_cycle(uuid) from public,anon;
revoke all on function public.lock_sales_360_cycle(uuid,text) from public,anon;
revoke all on function public.submit_sales_360_calibration(uuid,numeric,text,jsonb) from public,anon;
revoke all on function public.review_sales_360_calibration(uuid,boolean,text) from public,anon;
revoke all on function public.review_sales_360_appeal(uuid,boolean,text,numeric) from public,anon;
grant execute on function public.create_sales_360_cycle(date,boolean) to authenticated;
grant execute on function public.set_sales_360_goal(uuid,numeric,numeric,boolean,text) to authenticated;
grant execute on function public.submit_sales_360_evaluation(uuid,jsonb,text,text) to authenticated;
grant execute on function public.submit_sales_360_appeal(uuid,text,jsonb) to authenticated;
grant execute on function public.get_my_sales_360_workspace() to authenticated;
grant execute on function public.calculate_sales_360_cycle(uuid) to authenticated;
grant execute on function public.lock_sales_360_cycle(uuid,text) to authenticated;
grant execute on function public.submit_sales_360_calibration(uuid,numeric,text,jsonb) to authenticated;
grant execute on function public.review_sales_360_calibration(uuid,boolean,text) to authenticated;
grant execute on function public.review_sales_360_appeal(uuid,boolean,text,numeric) to authenticated;
grant execute on function public.submit_sales_360_evaluation(uuid,jsonb,text,text) to crm_marketing_readonly;
grant execute on function public.get_my_sales_360_workspace() to crm_marketing_readonly;
