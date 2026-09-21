-- Explicit business management scope. Export approvals retain their separate scope.
-- Candidate only: production application requires independent permission review.
begin;
create table private.crm_manager_teams (
 manager_id uuid not null references public.profiles(id),
 team text not null check (team=btrim(team) and team<>''),
 active boolean not null default true,
 reason text not null check (char_length(btrim(reason)) between 8 and 1000),
 approval_reference text not null check (char_length(btrim(approval_reference)) between 8 and 1000),
 primary key(manager_id,team)
);
create table private.crm_manager_team_events (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default clock_timestamp(), executor text not null,
 before_data jsonb, after_data jsonb not null
);
alter table private.crm_manager_teams enable row level security;
alter table private.crm_manager_team_events enable row level security;
revoke all on private.crm_manager_teams,private.crm_manager_team_events from public,anon,authenticated,service_role;
create trigger crm_manager_team_events_immutable before update or delete on private.crm_manager_team_events
for each row execute function private.reject_risk_event_mutation();
create trigger crm_manager_teams_no_delete before delete on private.crm_manager_teams
for each row execute function private.reject_risk_event_mutation();
create function private.audit_crm_manager_team() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.manager_id,new.team) is distinct from (old.manager_id,old.team) then
  raise exception '授权对象不可改绑，请停用旧授权后新建';
 end if;
 insert into private.crm_manager_team_events(executor,before_data,after_data)
 values(session_user,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function private.audit_crm_manager_team() from public,anon,authenticated,service_role;
create trigger crm_manager_teams_audit after insert or update on private.crm_manager_teams
for each row execute function private.audit_crm_manager_team();
create function private.crm_manager_covers(manager uuid,target_team text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=manager and p.active=true and p.role='sales_manager'
 and not p.is_test_data and p.data_environment='production' and nullif(btrim(target_team),'') is not null
 and case when exists(select 1 from private.crm_manager_teams t where t.manager_id=p.id)
 then exists(select 1 from private.crm_manager_teams t where t.manager_id=p.id and t.team=target_team and t.active)
 else p.team=target_team end);
$$;
create function private.crm_manager_covers_user(manager uuid,subject_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=subject_id and p.role='sales'
 and not p.is_test_data and p.data_environment='production' and private.crm_manager_covers(manager,p.team));
$$;
-- Shared unassigned valid intake remains available for assignment. Assigned data
-- follows its current owner; unrelated/null-team records never confer authority.
create function private.crm_manager_covers_inquiry(manager uuid,target_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.inquiries i where i.id=target_id and not i.is_test_data
 and not coalesce(i.excluded_from_dashboard,false) and (
 private.crm_manager_covers_user(manager,i.owner_id)
 or (i.owner_id is null and i.validity='valid' and exists(select 1 from public.profiles p
 where p.id=manager and p.active and p.role='sales_manager' and not p.is_test_data
 and p.data_environment='production' and exists(select 1 from public.profiles s
 where s.role='sales' and s.active and private.crm_manager_covers_user(manager,s.id))))));
$$;
create function private.crm_manager_covers_company(manager uuid,target_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.inquiries i where i.company_id=target_id
 and private.crm_manager_covers_inquiry(manager,i.id));
$$;
create function private.assert_crm_manager_inquiry(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if private.current_crm_role()='sales_manager' and not private.crm_manager_covers_inquiry(auth.uid(),target_id)
 then raise exception '该询盘不在主管授权团队范围内'; end if;
end $$;
revoke all on function private.crm_manager_covers(uuid,text),private.crm_manager_covers_user(uuid,uuid),
 private.crm_manager_covers_inquiry(uuid,uuid),private.crm_manager_covers_company(uuid,uuid),private.assert_crm_manager_inquiry(uuid)
 from public,anon,authenticated,service_role;
grant execute on function private.crm_manager_covers(uuid,text),private.crm_manager_covers_user(uuid,uuid),
 private.crm_manager_covers_inquiry(uuid,uuid),private.crm_manager_covers_company(uuid,uuid) to authenticated;
create function public.get_my_management_scope() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; teams jsonb; people jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active and not is_test_data and data_environment='production';
 if actor.id is null or actor.role not in ('owner','sales_manager') then raise exception '仅管理角色可查询管理范围'; end if;
 select coalesce(jsonb_agg(t.team order by t.team),'[]'::jsonb) into teams from (
 select distinct p.team from public.profiles p where p.role='sales' and p.active and not p.is_test_data
 and p.data_environment='production' and nullif(btrim(p.team),'') is not null
 and (actor.role='owner' or private.crm_manager_covers(actor.id,p.team))) t;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'team',p.team) order by p.full_name),'[]'::jsonb)
 into people from public.profiles p where p.role='sales' and p.active and not p.is_test_data and p.data_environment='production'
 and (actor.role='owner' or private.crm_manager_covers_user(actor.id,p.id));
 return jsonb_build_object('teams',teams,'people',people);
end $$;
revoke all on function public.get_my_management_scope() from public,anon;
grant execute on function public.get_my_management_scope() to authenticated;
-- Exact account and departments confirmed by the project owner; do not change roles/team.
do $$ begin
 if not exists(select 1 from public.profiles where id='79727b73-5a54-40ff-bd1b-28dcf8d0bb23'
 and full_name='凌子学' and role='sales_manager' and active and not is_test_data and data_environment='production')
 then raise exception '凌子学账号状态与批准目标不一致，请重新复核'; end if;
end $$;
insert into private.crm_manager_teams(manager_id,team,reason,approval_reference) values
 ('79727b73-5a54-40ff-bd1b-28dcf8d0bb23','海外业务部','用户确认凌子学同时管理海外业务部和海外工程部','2026-09-21 用户确认；本迁移须独立复核'),
 ('79727b73-5a54-40ff-bd1b-28dcf8d0bb23','海外工程部','用户确认凌子学同时管理海外业务部和海外工程部','2026-09-21 用户确认；本迁移须独立复核');

create policy crm_manager_scope on public.inquiries as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),id)));

create policy crm_manager_scope on public.companies as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_company(auth.uid(),id)));

create policy crm_manager_scope on public.contacts as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_company(auth.uid(),company_id)));

create policy crm_manager_scope on public.customer_documents as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_company(auth.uid(),company_id)));

create policy crm_manager_scope on public.daily_sales_reports as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_user(auth.uid(),sales_id)));

create policy crm_manager_scope on public.sales_daily_plans as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_user(auth.uid(),owner_id)));

create policy crm_manager_scope on public.audit_logs as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or ((entity_type='inquiry' and private.crm_manager_covers_inquiry(auth.uid(),entity_id)) or (entity_type='quotation' and exists(select 1 from public.quotation_versions q where q.id=entity_id and private.crm_manager_covers_inquiry(auth.uid(),q.inquiry_id)))));

create policy crm_manager_scope on public.notifications as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (inquiry_id is null or private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.profiles as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (id=auth.uid() or role<>'sales' or private.crm_manager_covers_user(auth.uid(),id)));

create policy crm_manager_scope on public.follow_ups as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.quotation_versions as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.outreach_drafts as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.communication_summaries as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.email_messages as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.inquiry_assignment_history as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.inquiry_stage_history as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.inquiry_won_requests as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.inquiry_lost_requests as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.inquiry_retention_requests as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.inquiry_public_pool_requests as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.inquiry_contact_policies as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.inquiry_marketing_touches as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.email_intake as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.inquiry_user_journey_events as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.whatsapp_messages as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

create policy crm_manager_scope on public.whatsapp_reply_reminders as restrictive for select to authenticated
using (private.current_crm_role() is distinct from 'sales_manager' or (private.crm_manager_covers_inquiry(auth.uid(),inquiry_id)));

-- Managers inspect company data; maintenance stays with market/sales/owner.
create policy crm_manager_company_no_write on public.companies as restrictive for update to authenticated
using (private.current_crm_role() is distinct from 'sales_manager')
with check (private.current_crm_role() is distinct from 'sales_manager');
drop policy sales_360_results_read on public.sales_360_results;
create policy sales_360_results_read on public.sales_360_results for select to authenticated
using (sales_id=auth.uid() or private.current_crm_role()='owner' or private.crm_manager_covers_user(auth.uid(),sales_id));

-- Refuse to overwrite concurrent production edits to set_sales_360_goal.
do $$ begin
 if md5(pg_get_functiondef('public.set_sales_360_goal(uuid, numeric, numeric, boolean, text)'::regprocedure)) <> '9eb2eae640e1b41503a28f5a323d3239' then
 raise exception '生产函数 set_sales_360_goal 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.set_sales_360_goal(target_result_id uuid, target_won_amount_cny numeric, target_bonus_base numeric, protect_new_hire boolean DEFAULT false, target_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_role public.crm_role; item public.sales_360_results; old_goal jsonb; saved public.sales_360_goals;
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  select * into item from public.sales_360_results where id=target_result_id for update;
  if item.id is null then raise exception '评分结果不存在'; end if;
  if actor_role is null or actor_role not in ('owner','sales_manager') then raise exception '仅老板或销售主管可设置目标'; end if;
  if actor_role='sales_manager' and not exists(
    select 1 from public.profiles viewer,public.profiles subject
    where viewer.id=actor and subject.id=item.sales_id and private.crm_manager_covers_user(actor,subject.id)
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
end $function$;

-- Refuse to overwrite concurrent production edits to submit_sales_360_calibration.
do $$ begin
 if md5(pg_get_functiondef('public.submit_sales_360_calibration(uuid, numeric, text, jsonb)'::regprocedure)) <> '41d70227be33d521fcf20496171a3e54' then
 raise exception '生产函数 submit_sales_360_calibration 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.submit_sales_360_calibration(target_result_id uuid, proposed_total_score numeric, calibration_reason text, calibration_evidence jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_profile public.profiles; item public.sales_360_results; subject public.profiles; calibration_id uuid;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor_profile.role is distinct from 'sales_manager' then raise exception '仅直属销售主管可以提交校准建议'; end if;
  select * into item from public.sales_360_results where id=target_result_id for update;
  if item.id is null or item.state<>'calibration' or item.total_score is null then raise exception '评分结果尚未进入校准阶段'; end if;
  select * into subject from public.profiles where id=item.sales_id and active=true;
  if subject.id is null or not private.crm_manager_covers_user(actor,subject.id) then raise exception '只能校准本团队业务员'; end if;
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
end $function$;

-- Refuse to overwrite concurrent production edits to review_sales_360_appeal.
do $$ begin
 if md5(pg_get_functiondef('public.review_sales_360_appeal(uuid, boolean, text, numeric)'::regprocedure)) <> '317ba05253a56f246de73928e2d11cf7' then
 raise exception '生产函数 review_sales_360_appeal 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.review_sales_360_appeal(target_appeal_id uuid, approve boolean, review_note text, adjusted_total_score numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_profile public.profiles; appeal public.sales_360_appeals; item public.sales_360_results; subject public.profiles; next_status text;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor_profile.role is null or actor_profile.role not in ('owner','sales_manager') then raise exception '当前角色不能审核评分申诉'; end if;
  if char_length(btrim(coalesce(review_note,'')))<8 then raise exception '请填写至少 8 个字的审核依据'; end if;
  select * into appeal from public.sales_360_appeals where id=target_appeal_id for update;
  if appeal.id is null then raise exception '申诉不存在'; end if;
  select * into item from public.sales_360_results where id=appeal.result_id for update;
  select * into subject from public.profiles where id=item.sales_id;
  if actor_profile.role='sales_manager' then
    if appeal.status<>'pending_manager' then raise exception '该申诉不在主管初审阶段'; end if;
    if not private.crm_manager_covers_user(actor,subject.id) then raise exception '只能初审本团队业务员申诉'; end if;
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
end $function$;

-- Refuse to overwrite concurrent production edits to get_my_sales_360_workspace.
do $$ begin
 if md5(pg_get_functiondef('public.get_my_sales_360_workspace()'::regprocedure)) <> '55f54f89aa2b529d2a680d66804493a2' then
 raise exception '生产函数 get_my_sales_360_workspace 已变化，请重新复核'; end if;
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
  where a.evaluator_id=actor and a.status<>'void' and (a.evaluator_group<>'manager' or private.crm_manager_covers_user(actor,a.subject_id));

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

-- Refuse to overwrite concurrent production edits to get_my_sales_360_talent_recommendations.
do $$ begin
 if md5(pg_get_functiondef('public.get_my_sales_360_talent_recommendations()'::regprocedure)) <> 'ae2c88edb3715fc62ce7cf68fdadb3e8' then
 raise exception '生产函数 get_my_sales_360_talent_recommendations 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.get_my_sales_360_talent_recommendations()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    or (actor_profile.role='sales_manager' and private.crm_manager_covers_user(actor,s.id))
    or (actor_profile.role='sales' and r.sales_id=actor and t.action_type in ('recognition','training','coaching','no_action'));
  return payload;
end $function$;

-- Refuse to overwrite concurrent production edits to submit_direct_sales_360_evaluation.
do $$ begin
 if md5(pg_get_functiondef('public.submit_direct_sales_360_evaluation(uuid, date, jsonb, text, text)'::regprocedure)) <> '4e23c1a19ef67d4f8db5665b4a9e38d6' then
 raise exception '生产函数 submit_direct_sales_360_evaluation 已变化，请重新复核'; end if;
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
  if actor.role='sales_manager' and not private.crm_manager_covers_user(actor.id,subject.id) then
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

-- Refuse to overwrite concurrent production edits to create_sales_360_cycle.
do $$ begin
 if md5(pg_get_functiondef('public.create_sales_360_cycle(date, boolean)'::regprocedure)) <> 'f6abe321134d7a3d82d25c7fa9d022ba' then
 raise exception '生产函数 create_sales_360_cycle 已变化，请重新复核'; end if;
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

-- Refuse to overwrite concurrent production edits to submit_sales_360_evaluation.
do $$ begin
 if md5(pg_get_functiondef('public.submit_sales_360_evaluation(uuid, jsonb, text, text)'::regprocedure)) <> '92fd1b23029edce57cebd072c51c6449' then
 raise exception '生产函数 submit_sales_360_evaluation 已变化，请重新复核'; end if;
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
  if task.evaluator_group='manager' and not private.crm_manager_covers_user(actor,task.subject_id) then raise exception '该评分对象已不在主管授权团队范围内'; end if;
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
end $function$;

-- Refuse to overwrite concurrent production edits to assign_inquiry_to_sales.
do $$ begin
 if md5(pg_get_functiondef('public.assign_inquiry_to_sales(uuid, uuid, text)'::regprocedure)) <> '220cc70d2c98fc43a188f5d69392fa6b' then
 raise exception '生产函数 assign_inquiry_to_sales 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.assign_inquiry_to_sales(target_inquiry_id uuid, target_sales_id uuid, change_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_role public.crm_role;
  intake_id uuid;
  item public.inquiries;
  assigned_time timestamptz := clock_timestamp();
  next_status public.inquiry_status;
  is_reassignment boolean;
  reset_response_sla boolean;
  previous_effective_owner uuid;
begin
  if private.current_crm_role() is null or private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可分配询盘'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写分配或转派原因'; end if;

  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  perform private.assert_crm_manager_inquiry(item.id);
  if item.validity<>'valid' then raise exception '只有已确认有效的询盘才能分配'; end if;
  if item.status in ('won','lost') then raise exception '已关闭商机不能重新分配'; end if;
  if item.owner_id=target_sales_id then raise exception '该业务员已经是当前负责人'; end if;

  select role into target_role from public.profiles where id=target_sales_id and active;
  if target_role is distinct from 'sales' then raise exception '只能分配给启用中的销售账号'; end if;

  if private.current_crm_role()='sales_manager' and not private.crm_manager_covers_user(auth.uid(),target_sales_id) then raise exception '只能分配给主管授权团队的业务员'; end if;
  previous_effective_owner := item.owner_id;
  if previous_effective_owner is null and item.public_pool_entered_at is not null then
    select h.new_owner_id into previous_effective_owner
    from public.inquiry_assignment_history h
    where h.inquiry_id=target_inquiry_id
    order by h.assigned_at desc limit 1;
  end if;

  is_reassignment := item.owner_id is not null or item.public_pool_entered_at is not null;
  reset_response_sla := item.assigned_at is null or item.first_valid_contact_at is null;
  next_status := case
    when item.status='pending_assignment' then 'received'::public.inquiry_status
    when item.public_pool_entered_at is not null then item.status
    when item.owner_id is null then 'received'::public.inquiry_status
    else item.status
  end;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    owner_id=target_sales_id,
    status=next_status,
    assigned_at=case when reset_response_sla then assigned_time else item.assigned_at end,
    first_contact_due_at=case when reset_response_sla then assigned_time+interval '30 minutes' else item.first_contact_due_at end,
    retained_until=null,
    public_pool_entered_at=null,
    updated_by=auth.uid(),
    last_change_reason=trim(change_reason),
    updated_at=assigned_time
  where id=target_inquiry_id;

  insert into public.inquiry_assignment_history(inquiry_id,previous_owner_id,new_owner_id,assigned_by,reason,stage_at_assignment,is_reassignment,assigned_at)
  values(target_inquiry_id,previous_effective_owner,target_sales_id,auth.uid(),trim(change_reason),next_status,is_reassignment,assigned_time);

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,case when is_reassignment then 'reassignment' else 'assignment' end,trim(change_reason),
    jsonb_build_object('owner_id',previous_effective_owner,'status',item.status,'assigned_at',item.assigned_at,'public_pool_entered_at',item.public_pool_entered_at,'retained_until',item.retained_until),
    jsonb_build_object('owner_id',target_sales_id,'status',next_status,'assigned_at',case when reset_response_sla then assigned_time else item.assigned_at end,'public_pool_entered_at',null,'retained_until',null));

  if is_reassignment and previous_effective_owner is not null and previous_effective_owner<>target_sales_id then
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(previous_effective_owner,target_inquiry_id,'inquiry_reassigned_away','询盘已重新分配给其他业务员',trim(change_reason));
  end if;
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(target_sales_id,target_inquiry_id,case when is_reassignment then 'inquiry_reassigned' else 'inquiry_assigned' end,
    case when is_reassignment then '主管重新分配了一条询盘给你' else '主管已分配新询盘' end,trim(change_reason));

  select id into intake_id from public.email_intake where inquiry_id=target_inquiry_id;
  insert into public.integration_events(inquiry_id,email_intake_id,event_type,recipient_profile_id,payload)
  values(target_inquiry_id,intake_id,'notify_sales_assignment',target_sales_id,
    jsonb_build_object('is_reassignment',is_reassignment,'previous_owner_id',previous_effective_owner,'from_public_pool',item.public_pool_entered_at is not null,'stage',next_status));
end;
$function$;

-- Refuse to overwrite concurrent production edits to review_inquiry_invalid_request.
do $$ begin
 if md5(pg_get_functiondef('public.review_inquiry_invalid_request(uuid, boolean, text)'::regprocedure)) <> '5bf40665f1fd7fe2f1046477b49333ee' then
 raise exception '生产函数 review_inquiry_invalid_request 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.review_inquiry_invalid_request(target_inquiry_id uuid, approve boolean, review_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item public.inquiries;
begin
  if private.current_crm_role() is null or private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核无效申请'; end if;
  if nullif(trim(review_reason),'') is null then raise exception '请填写审核原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  perform private.assert_crm_manager_inquiry(item.id);
  if item.invalid_review_status is distinct from 'pending' then raise exception '当前没有待审核的无效申请'; end if;
  if item.invalid_requested_by=auth.uid() then raise exception '不能审批本人申请'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    validity=case when approve then 'invalid' else validity end,
    invalid_reason=case when approve then invalid_request_reason else invalid_reason end,
    invalid_review_status=case when approve then 'approved' else 'rejected' end,
    updated_by=auth.uid(),last_change_reason=(case when approve then '通过' else '驳回' end)||'无效申请：'||trim(review_reason),
    updated_at=clock_timestamp()
  where id=target_inquiry_id;
  if item.invalid_requested_by is not null then
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(item.invalid_requested_by,target_inquiry_id,
      case when approve then 'invalid_review_approved' else 'invalid_review_rejected' end,
      case when approve then '无效申请已通过' else '无效申请被驳回' end,trim(review_reason));
  end if;
end;
$function$;

-- Refuse to overwrite concurrent production edits to review_inquiry_retention.
do $$ begin
 if md5(pg_get_functiondef('public.review_inquiry_retention(uuid, boolean, text)'::regprocedure)) <> '85944fe0b46c70df7268f397d677519f' then
 raise exception '生产函数 review_inquiry_retention 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.review_inquiry_retention(target_request_id uuid, approve boolean, review_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  req public.inquiry_retention_requests;
  item public.inquiries;
  request_inquiry_id uuid;
begin
  if private.current_crm_role() is null or private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核保留申请'; end if;
  if nullif(trim(review_reason),'') is null then raise exception '请填写审核依据'; end if;

  select inquiry_id into request_inquiry_id
  from public.inquiry_retention_requests
  where id=target_request_id;
  if not found then raise exception '当前没有待审核的保留申请'; end if;

  -- Match the public-pool review lock order: inquiry first, request second.
  select * into item from public.inquiries where id=request_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  perform private.assert_crm_manager_inquiry(item.id);
  select * into req from public.inquiry_retention_requests where id=target_request_id for update;
  if not found or req.status<>'pending' then raise exception '当前没有待审核的保留申请'; end if;
  if req.requested_by=auth.uid() then raise exception '不能审批本人申请'; end if;
  if private.current_crm_role()='sales_manager' and not private.crm_manager_covers_user(auth.uid(),req.requested_by) then raise exception '申请人不在主管授权团队范围内'; end if;

  if approve then
    if item.validity<>'valid' or item.status in ('won','lost') then
      raise exception '商机已关闭或不再有效，不能批准保留申请';
    end if;
    if item.owner_id is distinct from req.requested_by or item.public_pool_entered_at is not null then
      raise exception '询盘负责人或公海状态已变化，请由当前负责人重新提交保留申请';
    end if;
    if req.requested_until<=current_date then
      raise exception '申请的保留截止日期已过，请重新提交新的日期';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id=req.requested_by and p.role='sales' and p.active
    ) then
      raise exception '申请人账号已停用或不再是业务员，不能批准保留申请';
    end if;
  end if;

  update public.inquiry_retention_requests
  set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),review_reason=trim(review_reason),reviewed_at=clock_timestamp()
  where id=target_request_id;

  if approve then
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries
    set retained_until=req.requested_until,public_pool_entered_at=null,
      updated_by=auth.uid(),last_change_reason='批准客户保留至'||req.requested_until::text||'：'||trim(review_reason),
      updated_at=clock_timestamp()
    where id=req.inquiry_id;
  end if;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'retention_approved' else 'retention_rejected' end,
    trim(review_reason),jsonb_build_object('retained_until',item.retained_until),
    jsonb_build_object('retained_until',case when approve then req.requested_until else item.retained_until end,'request_id',req.id));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'retention_approved' else 'retention_rejected' end,
    case when approve then '客户保留申请已通过' else '客户保留申请被驳回' end,trim(review_reason));
end;
$function$;

-- Refuse to overwrite concurrent production edits to review_inquiry_won.
do $$ begin
 if md5(pg_get_functiondef('public.review_inquiry_won(uuid, boolean, text)'::regprocedure)) <> '0cfac90deb33d37c3cb3875c340ac776' then
 raise exception '生产函数 review_inquiry_won 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.review_inquiry_won(target_request_id uuid, approve boolean, review_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  req public.inquiry_won_requests;
  item public.inquiries;
  locked_rate numeric;
  locked_at timestamptz := clock_timestamp();
begin
  if private.current_crm_role() is null or private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核成交申请'; end if;
  if nullif(trim(review_comment),'') is null then raise exception '请填写审核意见'; end if;
  select * into req from public.inquiry_won_requests where id=target_request_id for update;
  if not found or req.status <> 'pending' then raise exception '当前没有待审核的成交申请'; end if;
  if req.requested_by=auth.uid() then raise exception '不能审批本人申请'; end if;
  if private.current_crm_role()='sales_manager' and not private.crm_manager_covers_user(auth.uid(),req.requested_by) then raise exception '申请人不在主管授权团队范围内'; end if;
  select * into item from public.inquiries where id=req.inquiry_id for update;
  perform private.assert_crm_manager_inquiry(item.id);
  if approve then
    if item.validity <> 'valid' or item.status in ('won','lost') then raise exception '商机已关闭或不再有效，不能审批该成交申请'; end if;
    if item.owner_id is distinct from req.requested_by then raise exception '询盘负责人已变化，请由当前负责人重新提交成交申请'; end if;
    if item.status not in ('quoted','sample_sent','negotiating') or not exists (select 1 from public.quotation_versions q where q.inquiry_id=req.inquiry_id and q.status='sent' and q.sent_at is not null) then raise exception '报价流程不完整，不能确认成交'; end if;
    if not exists(select 1 from storage.objects where bucket_id=req.evidence_bucket and name=req.evidence_path) then raise exception '成交凭证文件已不存在'; end if;
    if req.won_currency='CNY' then locked_rate:=1;
    else select rate into locked_rate from public.exchange_rates where base_currency=req.won_currency and quote_currency='CNY' order by rate_date desc limit 1;
    end if;
    if locked_rate is null or locked_rate<=0 then raise exception '缺少该币种兑人民币汇率'; end if;
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set status='won',won_amount=req.won_amount,won_currency=req.won_currency,won_exchange_rate=locked_rate,won_at=locked_at,next_follow_up_at=null,updated_by=auth.uid(),last_change_reason='主管确认成交：'||trim(review_comment),updated_at=locked_at where id=req.inquiry_id;
  end if;
  update public.inquiry_won_requests set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),review_note=trim(review_comment),reviewed_at=locked_at,locked_exchange_rate=case when approve then locked_rate else null end,updated_at=locked_at where id=req.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'won_approved' else 'won_rejected' end,jsonb_build_object('status',item.status,'request_id',req.id),jsonb_build_object('status',case when approve then 'won' else item.status::text end,'request_id',req.id,'won_amount',req.won_amount,'won_currency',req.won_currency,'evidence_reviewed',approve),trim(review_comment));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body) values(req.requested_by,req.inquiry_id,case when approve then 'won_approval_approved' else 'won_approval_rejected' end,case when approve then '成交申请已通过' else '成交申请被驳回' end,trim(review_comment));
end;
$function$;

-- Refuse to overwrite concurrent production edits to review_inquiry_lost.
do $$ begin
 if md5(pg_get_functiondef('public.review_inquiry_lost(uuid, boolean, text)'::regprocedure)) <> '7994cd9da6120817b16162aa119c57c5' then
 raise exception '生产函数 review_inquiry_lost 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.review_inquiry_lost(target_request_id uuid, approve boolean, review_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  req public.inquiry_lost_requests;
  item public.inquiries;
begin
  if private.current_crm_role() is null or private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核丢单申请'; end if;
  if nullif(trim(review_comment),'') is null then raise exception '请填写审核意见'; end if;
  select * into req from public.inquiry_lost_requests where id=target_request_id for update;
  if not found or req.status <> 'pending' then raise exception '当前没有待审核的丢单申请'; end if;
  if req.requested_by=auth.uid() then raise exception '不能审批本人申请'; end if;
  if private.current_crm_role()='sales_manager' and not private.crm_manager_covers_user(auth.uid(),req.requested_by) then raise exception '申请人不在主管授权团队范围内'; end if;
  select * into item from public.inquiries where id=req.inquiry_id for update;
  perform private.assert_crm_manager_inquiry(item.id);
  if approve then
    if item.validity <> 'valid' or item.status in ('won','lost') then raise exception '商机已关闭或不再有效，不能审批该丢单申请'; end if;
    if item.owner_id is distinct from req.requested_by then raise exception '询盘负责人已变化，请由当前负责人重新提交丢单申请'; end if;
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set status='lost',lost_reason=req.loss_reason,next_follow_up_at=null,updated_by=auth.uid(),last_change_reason='主管确认丢单：'||trim(review_comment),updated_at=clock_timestamp() where id=req.inquiry_id;
  end if;
  update public.inquiry_lost_requests set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),review_note=trim(review_comment),reviewed_at=clock_timestamp(),updated_at=clock_timestamp() where id=req.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'lost_approved' else 'lost_rejected' end,jsonb_build_object('status',item.status,'request_id',req.id),jsonb_build_object('status',case when approve then 'lost' else item.status::text end,'request_id',req.id),trim(review_comment));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body) values(req.requested_by,req.inquiry_id,case when approve then 'lost_approved' else 'lost_rejected' end,case when approve then '丢单申请已通过' else '丢单申请被驳回' end,trim(review_comment));
end;
$function$;

-- Refuse to overwrite concurrent production edits to review_public_pool_action.
do $$ begin
 if md5(pg_get_functiondef('public.review_public_pool_action(uuid, boolean, text)'::regprocedure)) <> '3638f1f139536f9f5416137dfb3e52cd' then
 raise exception '生产函数 review_public_pool_action 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.review_public_pool_action(target_request_id uuid, approve boolean, review_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  req public.inquiry_public_pool_requests;
  item public.inquiries;
  other_request record;
  request_inquiry_id uuid;
begin
  if private.current_crm_role() is null or private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核公海申请'; end if;
  if nullif(trim(review_note),'') is null then raise exception '请填写审核依据'; end if;

  select inquiry_id into request_inquiry_id from public.inquiry_public_pool_requests where id=target_request_id;
  if not found then raise exception '当前没有待审核的公海申请'; end if;
  -- Every review for the same customer acquires locks in this order to avoid
  -- double assignment and deadlocks between competing requests.
  select * into item from public.inquiries where id=request_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  perform private.assert_crm_manager_inquiry(item.id);
  select * into req from public.inquiry_public_pool_requests where id=target_request_id for update;
  if not found or req.status<>'pending' then raise exception '当前没有待审核的公海申请'; end if;
  if req.requested_by=auth.uid() then raise exception '不能审批本人申请'; end if;
  if private.current_crm_role()='sales_manager' and not private.crm_manager_covers_user(auth.uid(),req.requested_by) then raise exception '申请人不在主管授权团队范围内'; end if;

  if approve and req.request_type='claim' then
    if item.owner_id is not null or item.public_pool_entered_at is null then raise exception '该客户已被领取，当前申请不能再批准'; end if;
    perform public.assign_inquiry_to_sales(req.inquiry_id,req.requested_by,'批准公海领取：'||trim(review_note));
  elsif approve and req.request_type='release' then
    if item.owner_id is distinct from req.requested_by or item.public_pool_entered_at is not null then raise exception '客户负责人已变化，当前释放申请不能再批准'; end if;
    perform public.release_inquiry_to_public_pool(req.inquiry_id,'批准业务员释放申请：'||trim(review_note));
  end if;

  update public.inquiry_public_pool_requests set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),review_reason=trim(review_note),reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=target_request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'public_pool_request_approved' else 'public_pool_request_rejected' end,jsonb_build_object('request_id',req.id,'request_type',req.request_type,'requested_by',req.requested_by),trim(review_note));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'public_pool_request_approved' else 'public_pool_request_rejected' end,case when approve then '公海申请已通过' else '公海申请被驳回' end,trim(review_note));

  if approve and req.request_type='claim' then
    for other_request in
      update public.inquiry_public_pool_requests
      set status='cancelled',reviewed_by=auth.uid(),review_reason='该客户已由其他申请人领取',reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
      where inquiry_id=req.inquiry_id and request_type='claim' and status='pending' and id<>req.id
      returning id,requested_by
    loop
      insert into public.notifications(recipient_id,inquiry_id,type,title,body)
      values(other_request.requested_by,req.inquiry_id,'public_pool_request_cancelled','公海领取申请已关闭','该客户已由其他申请人领取');
      insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
      values(auth.uid(),'inquiry',req.inquiry_id,'public_pool_request_cancelled',jsonb_build_object('request_id',other_request.id,'requested_by',other_request.requested_by),'该客户已由其他申请人领取');
    end loop;
  end if;
end $function$;

-- Refuse to overwrite concurrent production edits to release_inquiry_to_public_pool.
do $$ begin
 if md5(pg_get_functiondef('public.release_inquiry_to_public_pool(uuid, text)'::regprocedure)) <> '44f82ee6189a550e4c92b0e548a4f99c' then
 raise exception '生产函数 release_inquiry_to_public_pool 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.release_inquiry_to_public_pool(target_inquiry_id uuid, release_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item public.inquiries;
begin
  if private.current_crm_role() is null or private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可释放客户到公海'; end if;
  if nullif(trim(release_reason),'') is null then raise exception '请填写释放原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  perform private.assert_crm_manager_inquiry(item.id);
  if item.owner_id is null then raise exception '该询盘当前没有负责人'; end if;
  if item.validity<>'valid' or item.status in ('won','lost') then raise exception '仅有效且进行中的询盘可以释放到公海'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set owner_id=null,retained_until=null,public_pool_entered_at=clock_timestamp(),
    updated_by=auth.uid(),last_change_reason='释放到客户公海：'||trim(release_reason),updated_at=clock_timestamp()
  where id=target_inquiry_id;
  update public.inquiry_retention_requests set status='rejected',reviewed_by=auth.uid(),
    review_reason='客户已释放到公海',reviewed_at=clock_timestamp()
  where inquiry_id=target_inquiry_id and status='pending';
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'released_to_public_pool',trim(release_reason),
    jsonb_build_object('owner_id',item.owner_id,'retained_until',item.retained_until),jsonb_build_object('owner_id',null,'public_pool_entered_at',clock_timestamp()));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(item.owner_id,target_inquiry_id,'released_to_public_pool','客户已释放到公海',trim(release_reason));
end;
$function$;

-- Refuse to overwrite concurrent production edits to save_inquiry_qualification.
do $$ begin
 if md5(pg_get_functiondef('public.save_inquiry_qualification(uuid, text, text, text, text, text, text, text, text, text)'::regprocedure)) <> 'de05c4d0be9303487b2826fd4d5939dd' then
 raise exception '生产函数 save_inquiry_qualification 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.save_inquiry_qualification(target_inquiry_id uuid, identity_note text, need_note text, contact_role_note text, value_note text, timing_note text, fit_note text, next_step_note text, requested_priority text, change_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item public.inquiries;
  actor_role public.crm_role:=private.current_crm_role();
  actor_id uuid:=auth.uid();
  next_identity text;
  next_need text;
  next_role text;
  next_value text;
  next_timing text;
  next_fit text;
  next_step text;
  next_priority text;
  next_score integer;
  confirmed_at timestamptz;
  confirmed_by uuid;
  occurred_at timestamptz:=clock_timestamp();
begin
  if actor_id is null or actor_role not in ('owner','sales_manager','marketing','sales') then
    raise exception '当前账号无权保存资格核验';
  end if;
  if nullif(btrim(change_reason),'') is null then raise exception '请填写资格核验修改原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  perform private.assert_crm_manager_inquiry(item.id);
  if actor_role='sales' and item.owner_id is distinct from actor_id then
    raise exception '业务员只能维护本人负责询盘的销售资格信息';
  end if;

  next_identity:=item.qualification_identity;
  next_need:=item.qualification_need;
  next_role:=item.qualification_role;
  next_value:=item.qualification_value;
  next_timing:=item.qualification_timing;
  next_fit:=item.qualification_fit;
  next_step:=item.qualification_next_step;
  next_priority:=item.lead_priority;

  if actor_role in ('owner','sales_manager','marketing') then
    next_identity:=nullif(btrim(identity_note),'');
    next_need:=nullif(btrim(need_note),'');
    next_fit:=nullif(btrim(fit_note),'');
  end if;
  if actor_role in ('owner','sales_manager','sales') then
    next_role:=nullif(btrim(contact_role_note),'');
    next_value:=nullif(btrim(value_note),'');
    next_timing:=nullif(btrim(timing_note),'');
    next_step:=nullif(btrim(next_step_note),'');
  end if;
  if actor_role in ('owner','sales_manager') then
    if requested_priority not in ('P0','P1','P2','P3') then raise exception '主管必须选择有效优先级'; end if;
    next_priority:=requested_priority;
  end if;

  next_score:=round((
    (case when next_identity is not null then 1 else 0 end)+
    (case when next_need is not null then 1 else 0 end)+
    (case when next_role is not null then 1 else 0 end)+
    (case when next_value is not null then 1 else 0 end)+
    (case when next_timing is not null then 1 else 0 end)+
    (case when next_fit is not null then 1 else 0 end)+
    (case when next_step is not null then 1 else 0 end)
  )*100.0/7)::integer;

  if actor_role in ('owner','sales_manager') and next_score=100 then
    confirmed_at:=occurred_at;
    confirmed_by:=actor_id;
  else
    confirmed_at:=null;
    confirmed_by:=null;
  end if;

  perform set_config('app.qualification_workflow_rpc','on',true);
  update public.inquiries set
    qualification_identity=next_identity,qualification_need=next_need,
    qualification_role=next_role,qualification_value=next_value,
    qualification_timing=next_timing,qualification_fit=next_fit,
    qualification_next_step=next_step,qualification_score=next_score,
    lead_priority=next_priority,qualification_manager_confirmed_at=confirmed_at,
    qualification_manager_confirmed_by=confirmed_by,last_change_reason=btrim(change_reason),
    updated_by=actor_id,updated_at=occurred_at
  where id=target_inquiry_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor_id,'inquiry',target_inquiry_id,'qualification_updated',
    jsonb_build_object('score',item.qualification_score,'priority',item.lead_priority,
      'manager_confirmed_at',item.qualification_manager_confirmed_at),
    jsonb_build_object('score',next_score,'priority',next_priority,'role',actor_role,
      'manager_confirmed_at',confirmed_at,'manager_confirmed_by',confirmed_by),btrim(change_reason));

  return jsonb_build_object(
    'qualification_identity',next_identity,'qualification_need',next_need,
    'qualification_role',next_role,'qualification_value',next_value,
    'qualification_timing',next_timing,'qualification_fit',next_fit,
    'qualification_next_step',next_step,'qualification_score',next_score,
    'lead_priority',next_priority,'qualification_manager_confirmed_at',confirmed_at,
    'qualification_manager_confirmed_by',confirmed_by,'updated_at',occurred_at
  );
end;
$function$;

-- Refuse to overwrite concurrent production edits to review_quotation.
do $$ begin
 if md5(pg_get_functiondef('public.review_quotation(uuid, boolean, text)'::regprocedure)) <> 'e8444494c3e2e60319c43c6bb18910cd' then
 raise exception '生产函数 review_quotation 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.review_quotation(target_quotation_id uuid, approve boolean, review_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare quote public.quotation_versions;
begin
  if private.current_crm_role() is null or private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核报价'; end if;
  if nullif(trim($3),'') is null then raise exception '请填写审核意见'; end if;
  select * into quote from public.quotation_versions where id=target_quotation_id for update;
  if not found or quote.status<>'pending_approval' then raise exception '当前没有待审核的报价'; end if;
  perform 1 from public.inquiries where id=quote.inquiry_id for share;
  perform private.assert_crm_manager_inquiry(quote.inquiry_id);
  if quote.created_by=auth.uid() then raise exception '不能审批本人报价'; end if;
  update public.quotation_versions set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=trim($3),updated_at=clock_timestamp() where id=quote.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'quotation',quote.id,case when approve then 'quotation_approved' else 'quotation_rejected' end,jsonb_build_object('status','pending_approval'),jsonb_build_object('status',case when approve then 'approved' else 'rejected' end,'inquiry_id',quote.inquiry_id),trim($3));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(quote.created_by,quote.inquiry_id,case when approve then 'quotation_approved' else 'quotation_rejected' end,case when approve then '报价已批准' else '报价被驳回' end,coalesce(quote.quote_no,'V'||quote.version_no)||' · '||trim($3));
end $function$;

-- Refuse to overwrite concurrent production edits to enforce_role_overlap_scope.
do $$ begin
 if md5(pg_get_functiondef('private.enforce_role_overlap_scope()'::regprocedure)) <> '968e1274e490b9c1a2d7a5a82282e5cd' then
 raise exception '生产函数 enforce_role_overlap_scope 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION private.enforce_role_overlap_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.current_crm_role()='sales_manager' then
    perform private.assert_crm_manager_inquiry(old.id);
    if new.owner_id is not null and not private.crm_manager_covers_user(auth.uid(),new.owner_id)
    then raise exception '目标负责人不在主管授权团队范围内'; end if;
  end if;
  if private.current_crm_role()='sales_manager'
     and coalesce(current_setting('app.inquiry_workflow_rpc',true),'')<>'on'
     and coalesce(current_setting('app.qualification_workflow_rpc',true),'')<>'on'
  then raise exception '销售主管请使用分配、审批或复核流程，不能直接代替业务员编辑询盘'; end if;
  if private.current_crm_role()='sales_manager'
     and new.validity is distinct from old.validity
     and not (old.invalid_review_status='pending' and new.invalid_review_status in ('approved','rejected'))
  then raise exception '销售主管仅处理有效性争议复核，正常初判由市场部完成'; end if;
  if private.current_crm_role()='marketing'
     and old.owner_id is not null
  then raise exception '已分配询盘由销售负责人维护，市场部仅保留归因与结果查看'; end if;
  return new;
end;
$function$;

-- Refuse to overwrite concurrent production edits to can_read_fulfillment.
do $$ begin
 if md5(pg_get_functiondef('private.can_read_fulfillment(uuid)'::regprocedure)) <> '803e4eb12470032ddfeb10dae95242d8' then
 raise exception '生产函数 can_read_fulfillment 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION private.can_read_fulfillment(target_inquiry_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active=true
      and (
        p.role='owner' or (p.role='sales_manager' and private.crm_manager_covers_inquiry(p.id,target_inquiry_id))
        or exists (
          select 1 from public.inquiries i
          where i.id=target_inquiry_id and i.owner_id=p.id
        )
      )
  )
$function$;

-- Refuse to overwrite concurrent production edits to can_write_fulfillment.
do $$ begin
 if md5(pg_get_functiondef('private.can_write_fulfillment(uuid)'::regprocedure)) <> '6ee184876eb5d0d77d66569c531dd2f1' then
 raise exception '生产函数 can_write_fulfillment 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION private.can_write_fulfillment(target_inquiry_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active=true
      and (
        p.role='owner'
        or (p.role='sales' and exists (
          select 1 from public.inquiries i
          where i.id=target_inquiry_id and i.owner_id=p.id
        ))
      )
  )
$function$;

-- Refuse to overwrite concurrent production edits to create_quotation_version.
do $$ begin
 if md5(pg_get_functiondef('public.create_quotation_version(uuid, text, text, numeric, text, date, text)'::regprocedure)) <> '075fdbdcbc1d45d24be83e45e69b2d2a' then
 raise exception '生产函数 create_quotation_version 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.create_quotation_version(target_inquiry_id uuid, quote_subject text, quote_currency text, quote_total numeric, quote_terms text DEFAULT NULL::text, quote_valid_until date DEFAULT NULL::date, quote_notes text DEFAULT NULL::text)
 RETURNS quotation_versions
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare next_version integer; saved public.quotation_versions;
begin
  if private.current_crm_role()='sales_manager' then raise exception '主管请使用审核流程，日常客户操作由负责业务员完成'; end if;
  if not exists(select 1 from public.inquiries where id=target_inquiry_id and (owner_id=auth.uid() or (select role from public.profiles where id=auth.uid()) in ('owner','sales_manager'))) then raise exception '只能为本人负责或有权管理的询盘创建报价'; end if;
  select coalesce(max(version_no),0)+1 into next_version from public.quotation_versions where inquiry_id=target_inquiry_id;
  insert into public.quotation_versions(inquiry_id,version_no,subject,currency,total_amount,trade_terms,validity_until,notes,created_by)
  values(target_inquiry_id,next_version,trim(quote_subject),upper(trim(quote_currency)),quote_total,nullif(trim(quote_terms),''),quote_valid_until,nullif(trim(quote_notes),''),auth.uid()) returning * into saved;
  return saved;
end $function$;

-- Refuse to overwrite concurrent production edits to create_quotation_version_v2.
do $$ begin
 if md5(pg_get_functiondef('public.create_quotation_version_v2(uuid, text, text, jsonb, text, date, text)'::regprocedure)) <> '8eadf52bd60ce51e0996e88e60fc0bca' then
 raise exception '生产函数 create_quotation_version_v2 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.create_quotation_version_v2(target_inquiry_id uuid, quote_subject text, quote_currency text, quote_lines jsonb, quote_terms text DEFAULT NULL::text, quote_valid_until date DEFAULT NULL::date, quote_notes text DEFAULT NULL::text)
 RETURNS quotation_versions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_role text;
  next_version integer;
  saved public.quotation_versions;
  inquiry_number bigint;
  calculated_total numeric;
  normalized_currency text := upper(btrim(coalesce(quote_currency,'')));
  line jsonb;
begin
  if private.current_crm_role()='sales_manager' then raise exception '主管请使用审核流程，日常客户操作由负责业务员完成'; end if;
  if actor is null then raise exception '请先登录'; end if;
  select role into actor_role from public.profiles where id=actor and active;
  if actor_role is null then raise exception '当前账号不可用'; end if;
  if nullif(btrim(quote_subject),'') is null then raise exception '请填写报价主题'; end if;
  if normalized_currency !~ '^[A-Z]{3}$' then raise exception '币种必须使用三位大写代码，例如 USD、CNY 或 EUR'; end if;
  if quote_valid_until is not null and quote_valid_until < current_date then raise exception '报价有效期不能早于今天'; end if;
  if jsonb_typeof(quote_lines)<>'array' or jsonb_array_length(quote_lines)=0 then raise exception '请至少填写一项报价产品'; end if;

  -- Lock the inquiry so two concurrent requests cannot allocate the same version.
  select i.inquiry_no into inquiry_number
  from public.inquiries i
  where i.id=target_inquiry_id
    and (i.owner_id=actor or actor_role in ('owner','sales_manager'))
  for update;
  if inquiry_number is null then raise exception '只能为本人负责或有权管理的询盘创建报价'; end if;

  for line in select value from jsonb_array_elements(quote_lines)
  loop
    if jsonb_typeof(line)<>'object' or nullif(btrim(line->>'product'),'') is null then
      raise exception '每项报价必须填写产品或型号';
    end if;
    if not coalesce(line->>'quantity','') ~ '^\d+(\.\d+)?$' or (line->>'quantity')::numeric <= 0 then
      raise exception '每项报价数量必须大于 0';
    end if;
    if not coalesce(line->>'unit_price','') ~ '^\d+(\.\d+)?$' or (line->>'unit_price')::numeric < 0 then
      raise exception '每项报价单价不能小于 0';
    end if;
  end loop;

  select coalesce(sum((item->>'quantity')::numeric * (item->>'unit_price')::numeric),0)
  into calculated_total
  from jsonb_array_elements(quote_lines) item;
  select coalesce(max(version_no),0)+1 into next_version
  from public.quotation_versions where inquiry_id=target_inquiry_id;

  insert into public.quotation_versions(
    inquiry_id,version_no,quote_no,subject,currency,total_amount,line_items,
    trade_terms,validity_until,notes,created_by
  ) values (
    target_inquiry_id,next_version,
    'Q-'||to_char(current_date,'YYYYMM')||'-'||lpad(inquiry_number::text,6,'0')||'-V'||next_version,
    btrim(quote_subject),normalized_currency,calculated_total,quote_lines,
    nullif(btrim(quote_terms),''),quote_valid_until,nullif(btrim(quote_notes),''),actor
  ) returning * into saved;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'quotation',saved.id,'quotation_created',
    jsonb_build_object('inquiry_id',target_inquiry_id,'version_no',next_version,'quote_no',saved.quote_no,'currency',normalized_currency,'total_amount',calculated_total),
    '业务员创建报价版本');
  return saved;
end $function$;

-- Refuse to overwrite concurrent production edits to record_inquiry_followup.
do $$ begin
 if md5(pg_get_functiondef('public.record_inquiry_followup(uuid, text, text, text, timestamp with time zone, boolean)'::regprocedure)) <> 'e34880e032a771e86050f2c138253e0e' then
 raise exception '生产函数 record_inquiry_followup 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.record_inquiry_followup(target_inquiry_id uuid, follow_method text, follow_content text, customer_response text DEFAULT NULL::text, next_follow_at timestamp with time zone DEFAULT NULL::timestamp with time zone, mark_first_valid_contact boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_role public.crm_role := private.current_crm_role();
  item public.inquiries;
  followup_id uuid;
  occurred_at timestamptz := clock_timestamp();
begin
  if private.current_crm_role()='sales_manager' then raise exception '主管请使用审核流程，日常客户操作由负责业务员完成'; end if;
  if actor_role not in ('owner','sales_manager','sales') then
    raise exception '当前角色不能新增销售跟进';
  end if;
  if follow_method not in ('email','whatsapp','phone','meeting','other') then
    raise exception '请选择有效的跟进方式';
  end if;
  if nullif(trim(follow_content),'') is null then raise exception '请填写跟进内容'; end if;

  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.validity <> 'valid' or item.invalid_review_status='pending' then
    raise exception '只有已确认有效且无待审无效申请的询盘才能跟进';
  end if;
  if actor_role='sales' and item.owner_id is distinct from auth.uid() then
    raise exception '只能跟进本人负责的询盘';
  end if;
  if item.status not in ('won','lost') and next_follow_at is null then
    raise exception '进行中商机必须设置下次跟进时间';
  end if;
  if mark_first_valid_contact then
    if item.owner_id is null or item.assigned_at is null then raise exception '询盘完成分配后才能记录首次有效联系'; end if;
    if item.first_valid_contact_at is not null then raise exception '该询盘已经记录首次有效联系'; end if;
  end if;

  insert into public.follow_ups(inquiry_id,author_id,method,content,customer_feedback,next_follow_up_at,is_first_valid_contact)
  values(target_inquiry_id,auth.uid(),follow_method,trim(follow_content),nullif(trim(customer_response),''),next_follow_at,mark_first_valid_contact)
  returning id into followup_id;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    first_valid_contact_at=case when mark_first_valid_contact then occurred_at else first_valid_contact_at end,
    next_follow_up_at=coalesce(next_follow_at,next_follow_up_at),
    updated_by=auth.uid(),
    last_change_reason=case when mark_first_valid_contact then '新增可核验跟进并确认首次有效联系' else '新增跟进记录' end,
    updated_at=occurred_at
  where id=target_inquiry_id;

  return followup_id;
end;
$function$;

-- Refuse to overwrite concurrent production edits to record_inquiry_followup_v2.
do $$ begin
 if md5(pg_get_functiondef('public.record_inquiry_followup_v2(uuid, text, text, text, timestamp with time zone, boolean, text, timestamp with time zone)'::regprocedure)) <> '8720f7057acd46cb0fd818c8d51b970b' then
 raise exception '生产函数 record_inquiry_followup_v2 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.record_inquiry_followup_v2(target_inquiry_id uuid, follow_method text, follow_content text, customer_response text DEFAULT NULL::text, next_follow_at timestamp with time zone DEFAULT NULL::timestamp with time zone, mark_first_valid_contact boolean DEFAULT false, task_priority text DEFAULT 'normal'::text, reminder_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid:=auth.uid();
  actor_role public.crm_role;
  item public.inquiries;
  followup_id uuid;
  occurred_at timestamptz:=clock_timestamp();
begin
  if private.current_crm_role()='sales_manager' then raise exception '主管请使用审核流程，日常客户操作由负责业务员完成'; end if;
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
$function$;

-- Refuse to overwrite concurrent production edits to submit_quotation_for_approval.
do $$ begin
 if md5(pg_get_functiondef('public.submit_quotation_for_approval(uuid, text)'::regprocedure)) <> '06aa1c36abd428cd7edf358e0791b7b0' then
 raise exception '生产函数 submit_quotation_for_approval 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.submit_quotation_for_approval(target_quotation_id uuid, submit_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare quote public.quotation_versions; manager record;
begin
  if private.current_crm_role()='sales_manager' then raise exception '主管请使用审核流程，日常客户操作由负责业务员完成'; end if;
  if nullif(trim(submit_note),'') is null then raise exception '请填写提交审核说明'; end if;
  select q.* into quote from public.quotation_versions q join public.inquiries i on i.id=q.inquiry_id
  where q.id=target_quotation_id and (q.created_by=auth.uid() or i.owner_id=auth.uid()) for update of q;
  if not found then raise exception '只能提交本人创建或负责客户的报价'; end if;
  if quote.status not in ('draft','rejected') then raise exception '当前报价状态不能提交审核'; end if;
  update public.quotation_versions set status='pending_approval',submitted_at=clock_timestamp(),submission_note=trim(submit_note),reviewed_by=null,reviewed_at=null,review_note=null,updated_at=clock_timestamp() where id=quote.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'quotation',quote.id,'quotation_submitted',jsonb_build_object('status',quote.status),jsonb_build_object('status','pending_approval','inquiry_id',quote.inquiry_id),trim(submit_note));
  for manager in select id from public.profiles where active and (role='owner' or (role='sales_manager' and private.crm_manager_covers_inquiry(id,quote.inquiry_id))) loop
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(manager.id,quote.inquiry_id,'quotation_review_requested','报价待审核',coalesce(quote.quote_no,'V'||quote.version_no)||' · '||trim(submit_note));
  end loop;
end $function$;

-- Refuse to overwrite concurrent production edits to set_customer_contact_avatar.
do $$ begin
 if md5(pg_get_functiondef('public.set_customer_contact_avatar(uuid, text)'::regprocedure)) <> 'f304c471f2de668f6c533a87587680f4' then
 raise exception '生产函数 set_customer_contact_avatar 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.set_customer_contact_avatar(target_contact_id uuid, avatar_path text)
 RETURNS contacts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid:=auth.uid();
  actor_role public.crm_role;
  current_contact public.contacts;
  saved public.contacts;
  normalized_path text:=trim(avatar_path);
begin
  if private.current_crm_role()='sales_manager' then raise exception '主管请使用审核流程，日常客户操作由负责业务员完成'; end if;
  if actor_id is null then raise exception '请先登录'; end if;
  select p.role into actor_role
  from public.profiles p
  where p.id=actor_id and p.active=true;
  if actor_role is null then raise exception '当前账号无权更新联系人头像'; end if;

  select c.* into current_contact
  from public.contacts c
  where c.id=target_contact_id
  for update;
  if not found then raise exception '联系人不存在'; end if;

  if not (
    actor_role in ('owner','sales_manager','marketing')
    or exists (
      select 1 from public.inquiries i
      where i.company_id=current_contact.company_id and i.owner_id=actor_id
    )
    or (
      current_contact.created_by=actor_id
      and not exists (
        select 1 from public.inquiries i
        where i.company_id=current_contact.company_id
      )
    )
  ) then
    raise exception '无权更新该联系人头像';
  end if;

  if normalized_path is null
     or normalized_path not like actor_id::text||'/contacts/'||target_contact_id::text||'/avatar-%'
     or normalized_path !~ '[.](jpg|png|webp)$'
     or normalized_path like '%..%'
  then
    raise exception '联系人头像路径无效';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='profile-avatars' and o.name=normalized_path
  ) then
    raise exception '联系人头像文件不存在';
  end if;

  update public.contacts
  set avatar_url=normalized_path,updated_at=clock_timestamp()
  where id=target_contact_id
  returning * into saved;

  insert into public.audit_logs(
    actor_id,entity_type,entity_id,action,before_data,after_data,reason
  ) values (
    actor_id,'contact',target_contact_id,'contact_avatar_updated',
    jsonb_build_object('avatar_url',current_contact.avatar_url),
    jsonb_build_object('avatar_url',saved.avatar_url),
    '更新客户联系人头像'
  );

  return saved;
end;
$function$;

create function private.crm_manager_covers_risk(manager uuid,target_domain text,subject_id uuid,inquiry_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select target_domain='business' and
 (subject_id is not null or inquiry_id is not null)
 and (subject_id is null or private.crm_manager_covers_user(manager,subject_id))
 and (inquiry_id is null or private.crm_manager_covers_inquiry(manager,inquiry_id));
$$;
revoke all on function private.crm_manager_covers_risk(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;

-- Refuse to overwrite concurrent production edits to get_my_risk_review_workspace.
do $$ begin
 if md5(pg_get_functiondef('public.get_my_risk_review_workspace()'::regprocedure)) <> 'ac9e752e22a518716409f65ec9483b0d' then
 raise exception '生产函数 get_my_risk_review_workspace 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.get_my_risk_review_workspace()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_profile public.profiles; payload jsonb;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor is null or actor_profile.id is null or actor_profile.role is null or actor_profile.role not in ('owner','sales_manager') then raise exception '当前角色无权查看风险审查中心'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'case_no',c.case_no,'domain',c.domain,'risk_type',c.risk_type,'severity',c.severity,'status',c.status,
    'title',c.title,'summary',c.summary,'evidence',c.evidence,'subject_user_id',c.subject_user_id,
    'subject_name',subject.full_name,'subject_team',subject.team,'inquiry_id',c.inquiry_id,'inquiry_no',i.inquiry_no,
    'inquiry_title',i.title,'assigned_reviewer_id',c.assigned_reviewer_id,'reviewer_name',reviewer.full_name,
    'detected_at',c.detected_at,'last_seen_at',c.last_seen_at,'due_at',c.due_at,'contained_at',c.contained_at,
    'resolved_at',c.resolved_at,'resolution',c.resolution,
    'controls',case when controls.user_id is null then '{}'::jsonb else jsonb_build_object(
      'export_suspended',controls.export_suspended,'download_suspended',controls.download_suspended,
      'sensitive_reveal_suspended',controls.sensitive_reveal_suspended,'reason',controls.reason,'applied_at',controls.applied_at) end,
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'reason',e.reason,
      'actor_name',event_actor.full_name,'before_data',e.before_data,'after_data',e.after_data,'created_at',e.created_at) order by e.created_at,e.id)
      from public.risk_case_events e left join public.profiles event_actor on event_actor.id=e.actor_id where e.case_id=c.id),'[]'::jsonb)
  ) order by array_position(array['p0','p1','p2','p3'],c.severity),c.due_at,c.detected_at desc),'[]'::jsonb) into payload
  from public.risk_cases c
  left join public.profiles subject on subject.id=c.subject_user_id
  left join public.profiles reviewer on reviewer.id=c.assigned_reviewer_id
  left join public.inquiries i on i.id=c.inquiry_id
  left join public.risk_case_controls controls on controls.user_id=c.subject_user_id and controls.source_case_id=c.id
  where actor_profile.role='owner'
    or private.crm_manager_covers_risk(actor,c.domain,c.subject_user_id,c.inquiry_id);
  return jsonb_build_object('role',actor_profile.role,'team',actor_profile.team,'cases',payload,'generated_at',clock_timestamp());
end $function$;

-- Refuse to overwrite concurrent production edits to review_risk_case.
do $$ begin
 if md5(pg_get_functiondef('public.review_risk_case(uuid, text, text)'::regprocedure)) <> '63510fabe5952fd19f03a923ff9a5304' then
 raise exception '生产函数 review_risk_case 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.review_risk_case(target_case_id uuid, decision text, decision_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_profile public.profiles; item public.risk_cases; subject public.profiles; before_row jsonb; next_status text;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor is null or actor_profile.id is null or actor_profile.role is null or actor_profile.role not in ('owner','sales_manager') then raise exception '当前角色无权审查风险'; end if;
  if char_length(btrim(coalesce(decision_reason,'')))<8 then raise exception '请填写至少 8 个字的审查依据'; end if;
  if decision not in ('start_review','remediation','contain','release','resolve','false_positive') then raise exception '风险处置动作无效'; end if;
  select * into item from public.risk_cases where id=target_case_id for update;
  if item.id is null then raise exception '风险案件不存在'; end if;
  select * into subject from public.profiles where id=item.subject_user_id;
  if actor_profile.role='sales_manager' and not private.crm_manager_covers_risk(actor,item.domain,item.subject_user_id,item.inquiry_id) then
    raise exception '销售主管只能处理本团队业务风险';
  end if;
  if item.subject_user_id=actor then raise exception '风险涉及本人时必须转由上级审查'; end if;
  if item.status in ('resolved','false_positive') then raise exception '风险案件已经关闭'; end if;
  if item.severity in ('p0','p1') and decision in ('contain','release','resolve','false_positive') and actor_profile.role<>'owner' then
    raise exception 'P0/P1 风险的控制、解除和终审仅限老板';
  end if;
  -- Serialize all control changes for the same subject across different cases.
  if item.subject_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('risk-control:'||item.subject_user_id::text,0));
  end if;
  before_row:=to_jsonb(item);
  if decision='contain' then
    if item.severity not in ('p0','p1') then raise exception '只有 P0/P1 风险允许暂停敏感能力'; end if;
    if item.subject_user_id is null then raise exception '该风险没有可限制的账号'; end if;
    insert into public.risk_case_controls(user_id,export_suspended,download_suspended,sensitive_reveal_suspended,source_case_id,reason,applied_at,applied_by,released_at,released_by)
    values(item.subject_user_id,true,true,true,item.id,btrim(decision_reason),clock_timestamp(),actor,null,null)
    on conflict(user_id,source_case_id) do update set export_suspended=true,download_suspended=true,sensitive_reveal_suspended=true,
      source_case_id=excluded.source_case_id,reason=excluded.reason,applied_at=excluded.applied_at,applied_by=excluded.applied_by,
      released_at=null,released_by=null,updated_at=clock_timestamp();
    next_status:='contained';
    update public.risk_cases set status=next_status,contained_at=coalesce(contained_at,clock_timestamp()),assigned_reviewer_id=actor,updated_at=clock_timestamp() where id=item.id;
  elsif decision='release' then
    if not exists(select 1 from public.risk_case_controls where user_id=item.subject_user_id and source_case_id=item.id and (export_suspended or download_suspended or sensitive_reveal_suspended)) then
      raise exception '该风险当前没有活动限制';
    end if;
    update public.risk_case_controls set export_suspended=false,download_suspended=false,sensitive_reveal_suspended=false,
      reason=btrim(decision_reason),released_at=clock_timestamp(),released_by=actor,updated_at=clock_timestamp()
    where user_id=item.subject_user_id and source_case_id=item.id;
    next_status:='remediation';
    update public.risk_cases set status=next_status,assigned_reviewer_id=actor,updated_at=clock_timestamp() where id=item.id;
  elsif decision='start_review' then
    next_status:='under_review';
    update public.risk_cases set status=next_status,assigned_reviewer_id=actor,updated_at=clock_timestamp() where id=item.id;
  elsif decision='remediation' then
    if item.status not in ('under_review','contained','remediation') then raise exception '请先开始审查'; end if;
    next_status:='remediation';
    update public.risk_cases set status=next_status,assigned_reviewer_id=actor,updated_at=clock_timestamp() where id=item.id;
  elsif decision in ('resolve','false_positive') then
    if decision='resolve' and item.severity<>'p3' and item.status not in ('under_review','remediation') then raise exception '请先完成审查或整改'; end if;
    if exists(select 1 from public.risk_case_controls where user_id=item.subject_user_id and source_case_id=item.id and (export_suspended or download_suspended or sensitive_reveal_suspended)) then
      raise exception '请先复验并解除活动限制';
    end if;
    next_status:=case when decision='resolve' then 'resolved' else 'false_positive' end;
    update public.risk_cases set status=next_status,resolution=btrim(decision_reason),resolved_at=clock_timestamp(),assigned_reviewer_id=actor,updated_at=clock_timestamp() where id=item.id;
  end if;
  if decision in ('contain','release') then
    perform private.refresh_risk_user_controls(item.subject_user_id);
  end if;
  insert into public.risk_case_events(case_id,actor_id,event_type,reason,before_data,after_data)
  values(item.id,actor,decision,btrim(decision_reason),jsonb_build_object('status',item.status,'severity',item.severity),jsonb_build_object('status',next_status,'reviewer_id',actor));
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor,'risk_case',item.id,'risk_case_'||decision,before_row,jsonb_build_object('status',next_status),btrim(decision_reason));
  return jsonb_build_object('case_id',item.id,'status',next_status,'decision',decision);
end $function$;

-- Refuse to overwrite concurrent production edits to upsert_risk_case.
do $$ begin
 if md5(pg_get_functiondef('private.upsert_risk_case(text, text, text, text, text, text, text, jsonb, uuid, uuid, uuid, text, uuid)'::regprocedure)) <> 'f2f1d5703b9f3ab0930145def949bcac' then
 raise exception '生产函数 upsert_risk_case 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION private.upsert_risk_case(risk_domain text, risk_type_name text, detection_rule_key text, detection_rule_version text, risk_severity text, risk_title text, risk_summary text, risk_evidence jsonb DEFAULT '{}'::jsonb, target_user_id uuid DEFAULT NULL::uuid, target_inquiry_id uuid DEFAULT NULL::uuid, target_company_id uuid DEFAULT NULL::uuid, source_name text DEFAULT 'rule'::text, detector_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare existing_case public.risk_cases; saved_id uuid; normalized_evidence jsonb:=coalesce(risk_evidence,'{}'::jsonb);
begin
  if risk_domain not in ('security','business') then raise exception '风险域无效'; end if;
  if risk_severity not in ('p0','p1','p2','p3') then raise exception '风险等级无效'; end if;
  if jsonb_typeof(normalized_evidence)<>'object' then raise exception '风险证据必须是对象'; end if;
  if normalized_evidence::text ~* '(access[_ -]?token|app[_ -]?secret|password|authorization)[^,}]{0,20}[:=][^,}]{8,}' then
    raise exception '风险证据不得包含密码或密钥值';
  end if;
  perform pg_advisory_xact_lock(hashtext(detection_rule_key||':'||coalesce(target_user_id::text,'-')||':'||coalesce(target_inquiry_id::text,'-')));
  select * into existing_case from public.risk_cases
  where rule_key=detection_rule_key
    and subject_user_id is not distinct from target_user_id
    and inquiry_id is not distinct from target_inquiry_id
    and status not in ('resolved','false_positive')
  order by created_at desc limit 1 for update;
  if existing_case.id is not null then
    update public.risk_cases set
      severity=case
        when array_position(array['p0','p1','p2','p3'],risk_severity)<array_position(array['p0','p1','p2','p3'],existing_case.severity) then risk_severity
        else existing_case.severity end,
      summary=risk_summary,evidence=normalized_evidence,last_seen_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=existing_case.id returning id into saved_id;
    return saved_id;
  end if;
  insert into public.risk_cases(domain,risk_type,rule_key,rule_version,severity,title,summary,evidence,
    subject_user_id,inquiry_id,company_id,detected_by,detection_source,due_at)
  values(risk_domain,risk_type_name,detection_rule_key,coalesce(nullif(detection_rule_version,''),'1.0'),risk_severity,
    risk_title,risk_summary,normalized_evidence,target_user_id,target_inquiry_id,target_company_id,detector_id,source_name,
    private.risk_due_at(risk_severity,clock_timestamp()))
  returning id into saved_id;
  insert into public.risk_case_events(case_id,actor_id,event_type,reason,after_data)
  values(saved_id,detector_id,'detected','确定性规则创建风险案件',jsonb_build_object('severity',risk_severity,'rule_key',detection_rule_key,'rule_version',coalesce(nullif(detection_rule_version,''),'1.0')));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  select p.id,target_inquiry_id,'risk_case_created',
    format('%s 风险待审查',upper(risk_severity)),
    format('%s · 风险案件 %s · 响应时限 %s',risk_title,saved_id,to_char(private.risk_due_at(risk_severity,clock_timestamp()) at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI'))
  from public.profiles p
  where p.active=true and (
    p.role='owner'
    or private.crm_manager_covers_risk(p.id,risk_domain,target_user_id,target_inquiry_id)
  );
  return saved_id;
end $function$;

-- Refuse to overwrite concurrent production edits to scan_crm_business_risks.
do $$ begin
 if md5(pg_get_functiondef('private.scan_crm_business_risks(uuid, text)'::regprocedure)) <> '08eb1c2990baa0375f20585bb7c16c37' then
 raise exception '生产函数 scan_crm_business_risks 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION private.scan_crm_business_risks(scanner_id uuid DEFAULT NULL::uuid, scanner_team text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item record; touched uuid[]:='{}'::uuid[]; saved uuid; scanned integer:=0;
begin
  for item in
    select i.id,i.inquiry_no,i.title,i.owner_id,i.company_id,i.created_at
    from public.inquiries i left join public.profiles owner on owner.id=i.owner_id
    where (scanner_id is null or exists(select 1 from public.profiles p where p.id=scanner_id and p.active and p.role='owner') or private.crm_manager_covers_inquiry(scanner_id,i.id))
      and not i.is_test_data and i.validity='valid' and i.excluded_from_dashboard=false and i.status not in ('won','lost')
      and i.owner_id is null and i.created_at<clock_timestamp()-interval '1 hour'
  loop
    saved:=private.upsert_risk_case('business','unassigned_inquiry','business.unassigned_inquiry','1.0',
      case when item.created_at<clock_timestamp()-interval '24 hours' then 'p1' else 'p2' end,
      '有效询盘长时间无人负责',format('询盘 #%s 已确认有效但尚未分配负责人。',item.inquiry_no),
      jsonb_build_object('inquiry_no',item.inquiry_no,'created_at',item.created_at,'condition','valid_unassigned'),
      null,item.id,item.company_id,'deterministic_scan',scanner_id);
    touched:=array_append(touched,saved);scanned:=scanned+1;
  end loop;
  for item in
    select i.id,i.inquiry_no,i.title,i.owner_id,i.company_id,i.first_contact_due_at
    from public.inquiries i join public.profiles owner on owner.id=i.owner_id and owner.active=true
    where (scanner_id is null or exists(select 1 from public.profiles p where p.id=scanner_id and p.active and p.role='owner') or private.crm_manager_covers_inquiry(scanner_id,i.id))
      and not i.is_test_data and i.validity='valid' and i.excluded_from_dashboard=false and i.status not in ('won','lost')
      and i.first_contact_due_at is not null and i.first_contact_due_at<clock_timestamp() and i.first_valid_contact_at is null
      and (scanner_team is null or owner.team is not distinct from scanner_team)
  loop
    saved:=private.upsert_risk_case('business','first_response_overdue','business.first_response_overdue','1.0','p1',
      '客户首次响应已逾期',format('询盘 #%s 已超过首次响应时限，仍没有有效联系证据。',item.inquiry_no),
      jsonb_build_object('inquiry_no',item.inquiry_no,'first_contact_due_at',item.first_contact_due_at,'condition','first_response_overdue'),
      item.owner_id,item.id,item.company_id,'deterministic_scan',scanner_id);
    touched:=array_append(touched,saved);scanned:=scanned+1;
  end loop;
  for item in
    select i.id,i.inquiry_no,i.title,i.owner_id,i.company_id,i.next_follow_up_at
    from public.inquiries i join public.profiles owner on owner.id=i.owner_id and owner.active=true
    where (scanner_id is null or exists(select 1 from public.profiles p where p.id=scanner_id and p.active and p.role='owner') or private.crm_manager_covers_inquiry(scanner_id,i.id))
      and not i.is_test_data and i.validity='valid' and i.excluded_from_dashboard=false and i.status not in ('won','lost')
      and i.next_follow_up_at is not null and i.next_follow_up_at<clock_timestamp()-interval '24 hours'
      and (scanner_team is null or owner.team is not distinct from scanner_team)
  loop
    saved:=private.upsert_risk_case('business','follow_up_overdue','business.follow_up_overdue','1.0','p2',
      '客户跟进计划已逾期',format('询盘 #%s 的下一次跟进时间已逾期超过 24 小时。',item.inquiry_no),
      jsonb_build_object('inquiry_no',item.inquiry_no,'next_follow_up_at',item.next_follow_up_at,'condition','follow_up_overdue_24h'),
      item.owner_id,item.id,item.company_id,'deterministic_scan',scanner_id);
    touched:=array_append(touched,saved);scanned:=scanned+1;
  end loop;
  return jsonb_build_object('scanned',scanned,'case_ids',to_jsonb(touched),'processed_at',clock_timestamp());
end $function$;

-- Refuse to overwrite concurrent production edits to run_crm_risk_scan.
do $$ begin
 if md5(pg_get_functiondef('public.run_crm_risk_scan()'::regprocedure)) <> '76c226c107925a94fc2e86963955a373' then
 raise exception '生产函数 run_crm_risk_scan 已变化，请重新复核'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.run_crm_risk_scan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_profile public.profiles; result jsonb;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor is null or actor_profile.id is null or actor_profile.role is null or actor_profile.role not in ('owner','sales_manager') then raise exception '仅老板或销售主管可以运行风险扫描'; end if;
  result:=private.scan_crm_business_risks(actor,null);
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'risk_scan',null,'crm_risk_scan_completed',result,'人工运行确定性业务风险扫描');
  return result;
end $function$;

notify pgrst,'reload schema';
commit;
