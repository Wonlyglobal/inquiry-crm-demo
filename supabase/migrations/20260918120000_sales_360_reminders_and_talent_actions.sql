-- Sales 360 phase 3: durable evaluation reminders and evidence-based talent suggestions.
-- Suggestions never perform promotion, elimination or bonus changes automatically.

create table if not exists public.sales_360_talent_recommendations (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null unique references public.sales_360_results(id) on delete cascade,
  action_type text not null check (action_type in (
    'recognition','promotion_candidate','training','coaching',
    'elimination_observation','elimination_review','no_action'
  )),
  rationale text not null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  shadow_only boolean not null default true,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  reviewed_by uuid references public.profiles(id),
  review_note text,
  reviewed_at timestamptz,
  generated_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists sales_360_talent_recommendations_status_idx
on public.sales_360_talent_recommendations(status,action_type,generated_at desc);

alter table public.sales_360_talent_recommendations enable row level security;
drop policy if exists sales_360_talent_recommendations_read on public.sales_360_talent_recommendations;
create policy sales_360_talent_recommendations_read
on public.sales_360_talent_recommendations for select to authenticated
using (
  private.current_crm_role()='owner'
  or exists(
    select 1 from public.sales_360_results r
    join public.profiles subject on subject.id=r.sales_id
    join public.profiles viewer on viewer.id=(select auth.uid())
    where r.id=result_id and (
      (viewer.role='sales_manager' and viewer.team is not distinct from subject.team)
      or (viewer.role='sales' and r.sales_id=viewer.id and action_type in ('recognition','training','coaching','no_action'))
    )
  )
);

revoke all on public.sales_360_talent_recommendations from anon,authenticated;
grant select on public.sales_360_talent_recommendations to authenticated;
grant all on public.sales_360_talent_recommendations to service_role;

create or replace function private.refresh_sales_360_talent_recommendation(target_result_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  item public.sales_360_results; cycle public.sales_360_cycles;
  recent_grades text[]; recent_c_count integer:=0; recent_d_count integer:=0;
  current_quarter_d_count integer:=0; qualifying_quarters integer:=0;
  action_name text:='no_action'; rationale_text text; recommendation_id uuid;
  focuses text[]:='{}'::text[]; plan_text text; evidence_payload jsonb;
  response_total numeric; response_met numeric; follow_total numeric; follow_met numeric;
  quote_total numeric; quote_met numeric; reply_total numeric; reply_met numeric;
begin
  select * into item from public.sales_360_results where id=target_result_id;
  if item.id is null or item.total_score is null or item.state not in ('locked','appeal','adjusted','closed') then return null; end if;
  select * into cycle from public.sales_360_cycles where id=item.cycle_id;

  select coalesce(array_agg(x.grade order by x.period_start desc),'{}'::text[]) into recent_grades
  from (
    select r.grade,c.period_start from public.sales_360_results r
    join public.sales_360_cycles c on c.id=r.cycle_id
    where r.sales_id=item.sales_id and r.total_score is not null
      and r.state in ('locked','appeal','adjusted','closed') and c.period_start<=cycle.period_start
    order by c.period_start desc limit 2
  ) x;
  recent_c_count:=(select count(*) from unnest(recent_grades) value where value='C');
  recent_d_count:=(select count(*) from unnest(recent_grades) value where value='D');

  select count(*) into current_quarter_d_count
  from public.sales_360_results r join public.sales_360_cycles c on c.id=r.cycle_id
  where r.sales_id=item.sales_id and r.grade='D' and r.total_score is not null
    and r.state in ('locked','appeal','adjusted','closed')
    and date_trunc('quarter',c.period_start)=date_trunc('quarter',cycle.period_start);

  select count(*) into qualifying_quarters from (
    select date_trunc('quarter',c.period_start) quarter_start,avg(r.total_score) average_score,count(*) month_count
    from public.sales_360_results r join public.sales_360_cycles c on c.id=r.cycle_id
    where r.sales_id=item.sales_id and r.total_score is not null
      and r.state in ('locked','appeal','adjusted','closed') and c.period_start<=cycle.period_start
    group by date_trunc('quarter',c.period_start)
    order by quarter_start desc limit 2
  ) quarter_result where quarter_result.average_score>=85 and quarter_result.month_count=3;

  response_total:=coalesce((item.objective_metrics->>'first_response_total')::numeric,0);
  response_met:=coalesce((item.objective_metrics->>'first_response_met')::numeric,0);
  follow_total:=coalesce((item.objective_metrics->>'follow_up_total')::numeric,0);
  follow_met:=coalesce((item.objective_metrics->>'follow_up_on_time')::numeric,0);
  quote_total:=coalesce((item.objective_metrics->>'quotation_total')::numeric,0);
  quote_met:=coalesce((item.objective_metrics->>'quotation_timely')::numeric,0);
  reply_total:=coalesce((item.objective_metrics->>'reply_total')::numeric,0);
  reply_met:=coalesce((item.objective_metrics->>'reply_within_24h')::numeric,0);
  if response_total>0 and response_met/response_total<0.8 then focuses:=array_append(focuses,'首次响应及时性'); end if;
  if follow_total>0 and follow_met/follow_total<0.8 then focuses:=array_append(focuses,'跟进任务按时完成'); end if;
  if quote_total>0 and quote_met/quote_total<0.8 then focuses:=array_append(focuses,'报价及时性'); end if;
  if reply_total>0 and reply_met/reply_total<0.8 then focuses:=array_append(focuses,'客户回信时效'); end if;
  if coalesce((item.objective_metrics->>'qualification_average')::numeric,0)<70 then focuses:=array_append(focuses,'询盘资格判断质量'); end if;
  if coalesce((item.objective_metrics->>'data_completeness')::numeric,0)<0.8 then focuses:=array_append(focuses,'CRM 数据完整度'); end if;
  if cardinality(focuses)=0 and item.grade in ('C','D') then focuses:=array['主管结合匿名评价汇总确定的首要改进项']; end if;

  if item.new_hire_protected and item.grade in ('C','D') then
    action_name:='training'; rationale_text:='新员工保护期内仅生成培训建议，不触发淘汰观察或评审。';
  elsif recent_d_count=2 or current_quarter_d_count>=2 then
    action_name:='elimination_review'; rationale_text:='连续两个月为 D，或本季度已出现两次 D；仅建议进入人工淘汰评审。';
  elsif item.grade='D' then
    action_name:='elimination_observation'; rationale_text:='本月等级为 D，建议进入观察并由主管制定改进计划。';
  elsif recent_c_count=2 then
    action_name:='coaching'; rationale_text:='最近连续两个月为 C，建议主管面谈并进入重点辅导。';
  elsif item.grade='C' then
    action_name:='training'; rationale_text:='本月等级为 C，建议制定并跟踪培训改进计划。';
  elsif qualifying_quarters=2 then
    action_name:='promotion_candidate'; rationale_text:='最近两个完整季度平均分均不低于 85，建议进入人工晋升候选评审。';
  elsif item.grade in ('S','A') then
    action_name:='recognition'; rationale_text:='本月达到优秀档位，建议进行认可并持续观察发展潜力。';
  else
    action_name:='no_action'; rationale_text:='本月处于达标区间，暂不触发专项人事建议。';
  end if;

  if action_name in ('training','coaching','elimination_observation','elimination_review') then
    plan_text:='建议改进重点：'||array_to_string(focuses,'、')||'。由直属主管设定可量化目标、复盘日期和完成证据。';
  else plan_text:=null; end if;

  evidence_payload:=jsonb_build_object(
    'grade',item.grade,'total_score',item.total_score,'recent_grades',recent_grades,
    'current_quarter_d_count',current_quarter_d_count,'qualifying_complete_quarters',qualifying_quarters,
    'new_hire_protected',item.new_hire_protected,'minimum_sample_met',item.minimum_sample_met,
    'focuses',to_jsonb(focuses),'formula_version',cycle.formula_version
  );
  insert into public.sales_360_talent_recommendations(result_id,action_type,rationale,evidence,shadow_only)
  values(item.id,action_name,rationale_text,evidence_payload,cycle.shadow_mode)
  on conflict(result_id) do update set action_type=excluded.action_type,rationale=excluded.rationale,
    evidence=excluded.evidence,shadow_only=excluded.shadow_only,status='pending',reviewed_by=null,
    review_note=null,reviewed_at=null,generated_at=clock_timestamp(),updated_at=clock_timestamp()
  returning id into recommendation_id;
  update public.sales_360_results set training_plan=plan_text where id=item.id and training_plan is distinct from plan_text;
  insert into public.sales_360_events(cycle_id,result_id,actor_id,event_type,after_data,reason)
  values(item.cycle_id,item.id,null,'talent_recommendation_generated',jsonb_build_object('recommendation_id',recommendation_id,'action_type',action_name,'shadow_only',cycle.shadow_mode),rationale_text);
  return recommendation_id;
end $$;
revoke all on function private.refresh_sales_360_talent_recommendation(uuid) from public,anon,authenticated;
grant execute on function private.refresh_sales_360_talent_recommendation(uuid) to service_role;

create or replace function private.sales_360_refresh_talent_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.total_score is not distinct from new.total_score
    and old.grade is not distinct from new.grade
    and old.new_hire_protected is not distinct from new.new_hire_protected
    and old.state in ('locked','appeal','adjusted','closed') then
    return new;
  end if;
  perform private.refresh_sales_360_talent_recommendation(new.id);
  return new;
end $$;
revoke all on function private.sales_360_refresh_talent_trigger() from public,anon,authenticated;

drop trigger if exists refresh_sales_360_talent_on_result on public.sales_360_results;
create trigger refresh_sales_360_talent_on_result
after update of total_score,grade,state,new_hire_protected on public.sales_360_results
for each row when (new.total_score is not null and new.state in ('locked','appeal','adjusted','closed'))
execute function private.sales_360_refresh_talent_trigger();

create or replace function public.review_sales_360_talent_recommendation(
  target_recommendation_id uuid,approve boolean,decision_note text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.crm_role; suggestion public.sales_360_talent_recommendations; item public.sales_360_results;
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor_role<>'owner' then raise exception '仅老板可以确认或驳回人才建议'; end if;
  if char_length(btrim(coalesce(decision_note,'')))<8 then raise exception '请填写至少 8 个字的人工决策依据'; end if;
  select * into suggestion from public.sales_360_talent_recommendations where id=target_recommendation_id for update;
  if suggestion.id is null or suggestion.status<>'pending' then raise exception '人才建议不存在或已经处理'; end if;
  select * into item from public.sales_360_results where id=suggestion.result_id;
  update public.sales_360_talent_recommendations set status=case when approve then 'confirmed' else 'rejected' end,
    reviewed_by=actor,review_note=btrim(decision_note),reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=suggestion.id;
  insert into public.sales_360_events(cycle_id,result_id,actor_id,event_type,before_data,after_data,reason)
  values(item.cycle_id,item.id,actor,'talent_recommendation_reviewed',
    jsonb_build_object('status',suggestion.status,'action_type',suggestion.action_type),
    jsonb_build_object('status',case when approve then 'confirmed' else 'rejected' end,'shadow_only',suggestion.shadow_only),btrim(decision_note));
  return jsonb_build_object('recommendation_id',suggestion.id,'status',case when approve then 'confirmed' else 'rejected' end,'shadow_only',suggestion.shadow_only);
end $$;
revoke all on function public.review_sales_360_talent_recommendation(uuid,boolean,text) from public,anon;
grant execute on function public.review_sales_360_talent_recommendation(uuid,boolean,text) to authenticated;

create or replace function public.get_my_sales_360_talent_recommendations()
returns jsonb language plpgsql security definer stable set search_path='' as $$
declare actor uuid:=auth.uid(); actor_profile public.profiles; payload jsonb;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor_profile.id is null then raise exception '登录状态无效'; end if;
  if actor_profile.role='marketing' then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'recommendation_id',t.id,'result_id',t.result_id,'sales_id',r.sales_id,'sales_name',s.full_name,
    'team',s.team,'period_start',c.period_start,'period_end',c.period_end,'grade',r.grade,
    'total_score',r.total_score,'action_type',t.action_type,'rationale',t.rationale,'evidence',t.evidence,
    'training_plan',r.training_plan,'shadow_only',t.shadow_only,'status',t.status,
    'review_note',t.review_note,'reviewed_at',t.reviewed_at
  ) order by c.period_start desc,s.full_name),'[]'::jsonb) into payload
  from public.sales_360_talent_recommendations t
  join public.sales_360_results r on r.id=t.result_id
  join public.sales_360_cycles c on c.id=r.cycle_id
  join public.profiles s on s.id=r.sales_id
  where actor_profile.role='owner'
    or (actor_profile.role='sales_manager' and actor_profile.team is not distinct from s.team)
    or (actor_profile.role='sales' and r.sales_id=actor and t.action_type in ('recognition','training','coaching','no_action'));
  return payload;
end $$;
revoke all on function public.get_my_sales_360_talent_recommendations() from public,anon;
grant execute on function public.get_my_sales_360_talent_recommendations() to authenticated;

create or replace function private.process_sales_360_evaluation_reminders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare inserted_count integer:=0; local_date date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
begin
  with due as (
    select a.id,a.evaluator_id,a.evaluator_group,a.due_at,s.full_name,c.period_start,
      case when a.due_at<=clock_timestamp()+interval '24 hours'
        then 'sales_360_evaluation_due_today' else 'sales_360_evaluation_due_2d' end notice_type
    from public.sales_360_evaluation_assignments a
    join public.sales_360_cycles c on c.id=a.cycle_id
    join public.profiles s on s.id=a.subject_id
    where a.status='pending' and c.status='collecting' and a.due_at>clock_timestamp()
      and a.due_at<=clock_timestamp()+interval '2 days'
  ), inserted as (
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    select d.evaluator_id,null,d.notice_type,
      case when d.notice_type='sales_360_evaluation_due_today' then '360 评价今日截止' else '360 评价将在两天内截止' end,
      format('%s · %s · 截止 %s · 任务 %s',d.full_name,d.evaluator_group,to_char(d.due_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI'),d.id)
    from due d
    where not exists(
      select 1 from public.notifications n where n.recipient_id=d.evaluator_id and n.type=d.notice_type and n.body like '%'||d.id::text||'%'
    ) returning 1
  ) select count(*) into inserted_count from inserted;
  return jsonb_build_object('inserted',inserted_count,'business_date',local_date,'processed_at',clock_timestamp());
end $$;
revoke all on function private.process_sales_360_evaluation_reminders() from public,anon,authenticated;
grant execute on function private.process_sales_360_evaluation_reminders() to service_role;

create extension if not exists pg_cron with schema extensions;
do $$ begin
  if exists(select 1 from cron.job where jobname='notify-sales-360-evaluations-hourly') then
    perform cron.unschedule('notify-sales-360-evaluations-hourly');
  end if;
  perform cron.schedule('notify-sales-360-evaluations-hourly','27 * * * *','select private.process_sales_360_evaluation_reminders()');
end $$;

select private.process_sales_360_evaluation_reminders();
