-- Phase A risk review foundation.
-- Deterministic rules only: no AI decision can contain, clear or close a case.

begin;

create table if not exists public.risk_cases (
  id uuid primary key default gen_random_uuid(),
  case_no bigint generated always as identity unique,
  domain text not null check (domain in ('security','business')),
  risk_type text not null,
  rule_key text not null,
  rule_version text not null default '1.0',
  severity text not null check (severity in ('p0','p1','p2','p3')),
  status text not null default 'open' check (status in ('open','contained','under_review','remediation','resolved','false_positive')),
  title text not null,
  summary text not null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  subject_user_id uuid references public.profiles(id) on delete set null,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  assigned_reviewer_id uuid references public.profiles(id) on delete set null,
  detected_by uuid references public.profiles(id) on delete set null,
  detection_source text not null default 'rule',
  detected_at timestamptz not null default clock_timestamp(),
  due_at timestamptz not null,
  contained_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  last_seen_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists risk_cases_queue_idx on public.risk_cases(status,severity,due_at,detected_at desc);
create index if not exists risk_cases_subject_idx on public.risk_cases(subject_user_id,status);
create index if not exists risk_cases_inquiry_idx on public.risk_cases(inquiry_id,status);
create index if not exists risk_cases_domain_idx on public.risk_cases(domain,status,detected_at desc);

create table if not exists public.risk_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.risk_cases(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  reason text not null,
  before_data jsonb not null default '{}'::jsonb check (jsonb_typeof(before_data)='object'),
  after_data jsonb not null default '{}'::jsonb check (jsonb_typeof(after_data)='object'),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists risk_case_events_case_idx on public.risk_case_events(case_id,created_at,id);

create table if not exists public.risk_user_controls (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  export_suspended boolean not null default false,
  download_suspended boolean not null default false,
  sensitive_reveal_suspended boolean not null default false,
  source_case_id uuid references public.risk_cases(id) on delete restrict,
  reason text,
  applied_at timestamptz,
  applied_by uuid references public.profiles(id) on delete set null,
  released_at timestamptz,
  released_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.risk_cases enable row level security;
alter table public.risk_case_events enable row level security;
alter table public.risk_user_controls enable row level security;

revoke all on public.risk_cases,public.risk_case_events,public.risk_user_controls from anon,authenticated;
grant all on public.risk_cases,public.risk_case_events,public.risk_user_controls to service_role;

create or replace function private.reject_risk_event_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception '风险事件为不可变审计记录，禁止更新或删除';
end $$;
revoke all on function private.reject_risk_event_mutation() from public,anon,authenticated;

drop trigger if exists risk_case_events_immutable on public.risk_case_events;
create trigger risk_case_events_immutable
before update or delete on public.risk_case_events
for each row execute function private.reject_risk_event_mutation();

create or replace function private.risk_due_at(level text,base_time timestamptz default clock_timestamp())
returns timestamptz language sql immutable set search_path='' as $$
  select base_time + case level
    when 'p0' then interval '15 minutes'
    when 'p1' then interval '1 hour'
    when 'p2' then interval '1 day'
    else interval '3 days' end
$$;
revoke all on function private.risk_due_at(text,timestamptz) from public,anon,authenticated;

create or replace function private.upsert_risk_case(
  risk_domain text,
  risk_type_name text,
  detection_rule_key text,
  detection_rule_version text,
  risk_severity text,
  risk_title text,
  risk_summary text,
  risk_evidence jsonb default '{}'::jsonb,
  target_user_id uuid default null,
  target_inquiry_id uuid default null,
  target_company_id uuid default null,
  source_name text default 'rule',
  detector_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
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
    or (risk_domain='business' and p.role='sales_manager' and (
      target_user_id is null
      or p.team is not distinct from (select subject.team from public.profiles subject where subject.id=target_user_id)
    ))
  );
  return saved_id;
end $$;
revoke all on function private.upsert_risk_case(text,text,text,text,text,text,text,jsonb,uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.upsert_risk_case(text,text,text,text,text,text,text,jsonb,uuid,uuid,uuid,text,uuid) to service_role;

create or replace function private.scan_crm_business_risks(scanner_id uuid default null,scanner_team text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item record; touched uuid[]:='{}'::uuid[]; saved uuid; scanned integer:=0;
begin
  for item in
    select i.id,i.inquiry_no,i.title,i.owner_id,i.company_id,i.created_at
    from public.inquiries i left join public.profiles owner on owner.id=i.owner_id
    where i.validity='valid' and i.excluded_from_dashboard=false and i.status not in ('won','lost')
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
    where i.validity='valid' and i.excluded_from_dashboard=false and i.status not in ('won','lost')
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
    where i.validity='valid' and i.excluded_from_dashboard=false and i.status not in ('won','lost')
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
end $$;
revoke all on function private.scan_crm_business_risks(uuid,text) from public,anon,authenticated;
grant execute on function private.scan_crm_business_risks(uuid,text) to service_role;

create or replace function public.run_crm_risk_scan()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_profile public.profiles; result jsonb;
begin
  select * into actor_profile from public.profiles where id=actor and active=true;
  if actor_profile.role not in ('owner','sales_manager') then raise exception '仅老板或销售主管可以运行风险扫描'; end if;
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
  if actor_profile.role not in ('owner','sales_manager') then raise exception '当前角色无权查看风险审查中心'; end if;
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
  left join public.risk_user_controls controls on controls.user_id=c.subject_user_id and controls.source_case_id=c.id
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
  if actor_profile.role not in ('owner','sales_manager') then raise exception '当前角色无权审查风险'; end if;
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
  before_row:=to_jsonb(item);
  if decision='contain' then
    if item.severity not in ('p0','p1') then raise exception '只有 P0/P1 风险允许暂停敏感能力'; end if;
    if item.subject_user_id is null then raise exception '该风险没有可限制的账号'; end if;
    insert into public.risk_user_controls(user_id,export_suspended,download_suspended,sensitive_reveal_suspended,source_case_id,reason,applied_at,applied_by,released_at,released_by)
    values(item.subject_user_id,true,true,true,item.id,btrim(decision_reason),clock_timestamp(),actor,null,null)
    on conflict(user_id) do update set export_suspended=true,download_suspended=true,sensitive_reveal_suspended=true,
      source_case_id=excluded.source_case_id,reason=excluded.reason,applied_at=excluded.applied_at,applied_by=excluded.applied_by,
      released_at=null,released_by=null,updated_at=clock_timestamp();
    next_status:='contained';
    update public.risk_cases set status=next_status,contained_at=coalesce(contained_at,clock_timestamp()),assigned_reviewer_id=actor,updated_at=clock_timestamp() where id=item.id;
  elsif decision='release' then
    if not exists(select 1 from public.risk_user_controls where user_id=item.subject_user_id and source_case_id=item.id and (export_suspended or download_suspended or sensitive_reveal_suspended)) then
      raise exception '该风险当前没有活动限制';
    end if;
    update public.risk_user_controls set export_suspended=false,download_suspended=false,sensitive_reveal_suspended=false,
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
    if exists(select 1 from public.risk_user_controls where user_id=item.subject_user_id and source_case_id=item.id and (export_suspended or download_suspended or sensitive_reveal_suspended)) then
      raise exception '请先复验并解除活动限制';
    end if;
    next_status:=case when decision='resolve' then 'resolved' else 'false_positive' end;
    update public.risk_cases set status=next_status,resolution=btrim(decision_reason),resolved_at=clock_timestamp(),assigned_reviewer_id=actor,updated_at=clock_timestamp() where id=item.id;
  end if;
  insert into public.risk_case_events(case_id,actor_id,event_type,reason,before_data,after_data)
  values(item.id,actor,decision,btrim(decision_reason),jsonb_build_object('status',item.status,'severity',item.severity),jsonb_build_object('status',next_status,'reviewer_id',actor));
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor,'risk_case',item.id,'risk_case_'||decision,before_row,jsonb_build_object('status',next_status),btrim(decision_reason));
  return jsonb_build_object('case_id',item.id,'status',next_status,'decision',decision);
end $$;
revoke all on function public.review_risk_case(uuid,text,text) from public,anon;
grant execute on function public.review_risk_case(uuid,text,text) to authenticated;

create extension if not exists pg_cron with schema extensions;
do $$ begin
  if exists(select 1 from cron.job where jobname='scan-crm-business-risks-hourly') then
    perform cron.unschedule('scan-crm-business-risks-hourly');
  end if;
  perform cron.schedule('scan-crm-business-risks-hourly','19 * * * *','select private.scan_crm_business_risks(null,null)');
end $$;

commit;
