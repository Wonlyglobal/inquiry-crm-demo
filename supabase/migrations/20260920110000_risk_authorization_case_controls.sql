-- Case-scoped restrictions; preserve risk_user_controls as an aggregate compatibility table.
begin;
-- Do not silently discard restrictions with missing provenance.
do $$ begin
  if exists(select 1 from public.risk_user_controls where source_case_id is null
    and (export_suspended or download_suspended or sensitive_reveal_suspended)) then
    raise exception '存在缺少案件来源的活动限制，须人工核对后迁移';
  end if;
end $$;
create table public.risk_case_controls (
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_case_id uuid not null references public.risk_cases(id) on delete restrict,
  export_suspended boolean not null default false,
  download_suspended boolean not null default false,
  sensitive_reveal_suspended boolean not null default false,
  reason text, applied_at timestamptz, applied_by uuid references public.profiles(id),
  released_at timestamptz, released_by uuid references public.profiles(id),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,source_case_id)
);
alter table public.risk_case_controls enable row level security;
revoke all on public.risk_case_controls from public,anon,authenticated;
grant all on public.risk_case_controls to service_role;

-- Recover the latest per-case containment decision from immutable events, including
-- restrictions overwritten by another case in the old single-source table.
insert into public.risk_case_controls(user_id,source_case_id,export_suspended,download_suspended,sensitive_reveal_suspended,reason,applied_at,applied_by)
select c.subject_user_id,c.id,true,true,true,e.reason,e.created_at,e.actor_id
from public.risk_cases c
cross join lateral (
  select event_type,reason,created_at,actor_id from public.risk_case_events
  where case_id=c.id and event_type in ('contain','release') order by created_at desc,id desc limit 1
) e
where c.subject_user_id is not null and e.event_type='contain';

-- Preserve any current restriction even when historical events are incomplete.
insert into public.risk_case_controls(user_id,source_case_id,export_suspended,download_suspended,sensitive_reveal_suspended,reason,applied_at,applied_by,released_at,released_by)
select user_id,source_case_id,export_suspended,download_suspended,sensitive_reveal_suspended,reason,applied_at,applied_by,released_at,released_by
from public.risk_user_controls where source_case_id is not null
on conflict(user_id,source_case_id) do update set
 export_suspended=risk_case_controls.export_suspended or excluded.export_suspended,
 download_suspended=risk_case_controls.download_suspended or excluded.download_suspended,
 sensitive_reveal_suspended=risk_case_controls.sensitive_reveal_suspended or excluded.sensitive_reveal_suspended;

-- Older overwritten restrictions may have allowed a case to close without release.
-- Reopen those cases for explicit review, retaining the immutable history.
with reopened as (
  update public.risk_cases c set status='remediation',resolved_at=null,updated_at=clock_timestamp()
  where c.status in ('resolved','false_positive') and exists(
    select 1 from public.risk_case_controls r where r.source_case_id=c.id
      and (r.export_suspended or r.download_suspended or r.sensitive_reveal_suspended))
  returning c.id
)
insert into public.risk_case_events(case_id,event_type,reason,after_data)
select id,'control_recovered','迁移恢复未解除的历史限制，重新进入整改等待人工复验',
  jsonb_build_object('status','remediation','migration','20260920110000') from reopened;

create or replace function private.refresh_risk_user_controls(target_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare flags record; latest public.risk_case_controls;
begin
  perform pg_advisory_xact_lock(hashtextextended('risk-control:'||target_user::text,0));
  select coalesce(bool_or(export_suspended),false) as ex,
    coalesce(bool_or(download_suspended),false) as dl,
    coalesce(bool_or(sensitive_reveal_suspended),false) as sr
  into flags from public.risk_case_controls where user_id=target_user;
  select * into latest from public.risk_case_controls where user_id=target_user
    order by (export_suspended or download_suspended or sensitive_reveal_suspended) desc,updated_at desc,source_case_id limit 1;
  insert into public.risk_user_controls(user_id,export_suspended,download_suspended,sensitive_reveal_suspended,source_case_id,reason,applied_at,applied_by,released_at,released_by)
  values(target_user,flags.ex,flags.dl,flags.sr,latest.source_case_id,latest.reason,latest.applied_at,latest.applied_by,
    case when flags.ex or flags.dl or flags.sr then null else latest.released_at end,
    case when flags.ex or flags.dl or flags.sr then null else latest.released_by end)
  on conflict(user_id) do update set export_suspended=excluded.export_suspended,download_suspended=excluded.download_suspended,
    sensitive_reveal_suspended=excluded.sensitive_reveal_suspended,source_case_id=excluded.source_case_id,
    reason=excluded.reason,applied_at=excluded.applied_at,applied_by=excluded.applied_by,
    released_at=excluded.released_at,released_by=excluded.released_by,updated_at=clock_timestamp();
end $$;
revoke all on function private.refresh_risk_user_controls(uuid) from public,anon,authenticated;
select private.refresh_risk_user_controls(user_id) from (select distinct user_id from public.risk_case_controls) subjects;

create or replace function public.run_crm_risk_scan()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_profile public.profiles; result jsonb;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor is null or actor_profile.id is null or actor_profile.role is null or actor_profile.role not in ('owner','sales_manager') then raise exception '仅老板或销售主管可以运行风险扫描'; end if;
  result:=private.scan_crm_business_risks(actor,case when actor_profile.role='sales_manager' then actor_profile.team else null end);
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'risk_scan',null,'crm_risk_scan_completed',result,'人工运行确定性业务风险扫描');
  return result;
end $$;
revoke all on function public.run_crm_risk_scan() from public,anon;
grant execute on function public.run_crm_risk_scan() to authenticated;

create or replace function public.get_my_risk_controls()
returns jsonb language plpgsql security definer stable set search_path='' as $$
declare actor uuid:=auth.uid(); controls public.risk_user_controls;
begin
  if actor is null then raise exception '请先登录'; end if;
  select * into controls from public.risk_user_controls where user_id=actor;
  return jsonb_build_object(
    'export_suspended',coalesce(controls.export_suspended,false),
    'download_suspended',coalesce(controls.download_suspended,false),
    'sensitive_reveal_suspended',coalesce(controls.sensitive_reveal_suspended,false),
    'source_case_id',controls.source_case_id,'reason',controls.reason,'applied_at',controls.applied_at
  );
end $$;
revoke all on function public.get_my_risk_controls() from public,anon;
grant execute on function public.get_my_risk_controls() to authenticated;

create or replace function public.get_my_risk_review_workspace()
returns jsonb language plpgsql security definer stable set search_path='' as $$
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
    or (c.domain='business' and (
      c.subject_user_id is null
      or subject.team is not distinct from actor_profile.team
      or c.assigned_reviewer_id=actor
    ));
  return jsonb_build_object('role',actor_profile.role,'team',actor_profile.team,'cases',payload,'generated_at',clock_timestamp());
end $$;
revoke all on function public.get_my_risk_review_workspace() from public,anon;
grant execute on function public.get_my_risk_review_workspace() to authenticated;

create or replace function public.review_risk_case(target_case_id uuid,decision text,decision_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_profile public.profiles; item public.risk_cases; subject public.profiles; before_row jsonb; next_status text;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor is null or actor_profile.id is null or actor_profile.role is null or actor_profile.role not in ('owner','sales_manager') then raise exception '当前角色无权审查风险'; end if;
  if char_length(btrim(coalesce(decision_reason,'')))<8 then raise exception '请填写至少 8 个字的审查依据'; end if;
  if decision not in ('start_review','remediation','contain','release','resolve','false_positive') then raise exception '风险处置动作无效'; end if;
  select * into item from public.risk_cases where id=target_case_id for update;
  if item.id is null then raise exception '风险案件不存在'; end if;
  select * into subject from public.profiles where id=item.subject_user_id;
  if actor_profile.role='sales_manager' and (item.domain<>'business' or (item.subject_user_id is not null and subject.team is distinct from actor_profile.team)) then
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
end $$;
revoke all on function public.review_risk_case(uuid,text,text) from public,anon;
grant execute on function public.review_risk_case(uuid,text,text) to authenticated;
commit;
