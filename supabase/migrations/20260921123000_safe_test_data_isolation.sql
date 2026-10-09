-- Quarantine the approved production acceptance fixture without deleting evidence.
-- Exact identifiers and assertions make this migration fail closed if the
-- audited target no longer matches the approval given on 2026-09-21.

begin;

alter table public.profiles
  add column if not exists is_test_data boolean not null default false,
  add column if not exists data_environment text not null default 'production';
alter table public.companies
  add column if not exists is_test_data boolean not null default false,
  add column if not exists data_environment text not null default 'production';
alter table public.contacts
  add column if not exists is_test_data boolean not null default false,
  add column if not exists data_environment text not null default 'production';
alter table public.inquiries
  add column if not exists is_test_data boolean not null default false,
  add column if not exists data_environment text not null default 'production';

alter table public.profiles drop constraint if exists profiles_data_environment_check;
alter table public.profiles add constraint profiles_data_environment_check
  check (data_environment in ('production','staging','test') and (not is_test_data or data_environment<>'production'));
alter table public.companies drop constraint if exists companies_data_environment_check;
alter table public.companies add constraint companies_data_environment_check
  check (data_environment in ('production','staging','test') and (not is_test_data or data_environment<>'production'));
alter table public.contacts drop constraint if exists contacts_data_environment_check;
alter table public.contacts add constraint contacts_data_environment_check
  check (data_environment in ('production','staging','test') and (not is_test_data or data_environment<>'production'));
alter table public.inquiries drop constraint if exists inquiries_data_environment_check;
alter table public.inquiries add constraint inquiries_data_environment_check
  check (data_environment in ('production','staging','test') and (not is_test_data or data_environment<>'production'));
alter table public.inquiries drop constraint if exists inquiries_test_data_excluded_check;
alter table public.inquiries add constraint inquiries_test_data_excluded_check
  check (not is_test_data or excluded_from_dashboard=true);

create index if not exists profiles_test_data_idx on public.profiles(is_test_data) where is_test_data;
create index if not exists companies_test_data_idx on public.companies(is_test_data) where is_test_data;
create index if not exists contacts_test_data_idx on public.contacts(is_test_data) where is_test_data;
create index if not exists inquiries_test_data_idx on public.inquiries(is_test_data) where is_test_data;

create or replace function private.guard_test_data_classification()
returns trigger language plpgsql security definer set search_path='' as $$
declare classification_changed boolean;
begin
  classification_changed := case
    when tg_op='INSERT' then new.is_test_data or new.data_environment<>'production'
    else old.is_test_data is distinct from new.is_test_data
      or old.data_environment is distinct from new.data_environment
  end;
  if classification_changed
     and coalesce(auth.role(),'')<>'service_role'
     and session_user not in ('postgres','supabase_admin') then
    raise exception '测试数据分类只能由受控生产迁移或服务端流程维护';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_test_data_classification() from public,anon,authenticated;

drop trigger if exists profiles_guard_test_data_classification on public.profiles;
create trigger profiles_guard_test_data_classification before insert or update on public.profiles
for each row execute function private.guard_test_data_classification();
drop trigger if exists companies_guard_test_data_classification on public.companies;
create trigger companies_guard_test_data_classification before insert or update on public.companies
for each row execute function private.guard_test_data_classification();
drop trigger if exists contacts_guard_test_data_classification on public.contacts;
create trigger contacts_guard_test_data_classification before insert or update on public.contacts
for each row execute function private.guard_test_data_classification();
drop trigger if exists inquiries_guard_test_data_classification on public.inquiries;
create trigger inquiries_guard_test_data_classification before insert or update on public.inquiries
for each row execute function private.guard_test_data_classification();

-- These restrictive policies are ANDed with existing role/ownership policies.
-- Owners keep audit visibility; other roles cannot read quarantined core rows.
drop policy if exists profiles_test_data_isolation_select on public.profiles;
create policy profiles_test_data_isolation_select on public.profiles as restrictive
for select to authenticated using (
  not is_test_data or id=(select auth.uid()) or private.current_crm_role()='owner'
);
drop policy if exists profiles_test_data_isolation_update on public.profiles;
create policy profiles_test_data_isolation_update on public.profiles as restrictive
for update to authenticated
using (not is_test_data or private.current_crm_role()='owner')
with check (not is_test_data or private.current_crm_role()='owner');

drop policy if exists companies_test_data_isolation_select on public.companies;
create policy companies_test_data_isolation_select on public.companies as restrictive
for select to authenticated using (not is_test_data or private.current_crm_role()='owner');
drop policy if exists companies_test_data_isolation_update on public.companies;
create policy companies_test_data_isolation_update on public.companies as restrictive
for update to authenticated
using (not is_test_data or private.current_crm_role()='owner')
with check (not is_test_data or private.current_crm_role()='owner');

drop policy if exists contacts_test_data_isolation_select on public.contacts;
create policy contacts_test_data_isolation_select on public.contacts as restrictive
for select to authenticated using (not is_test_data or private.current_crm_role()='owner');
drop policy if exists contacts_test_data_isolation_update on public.contacts;
create policy contacts_test_data_isolation_update on public.contacts as restrictive
for update to authenticated
using (not is_test_data or private.current_crm_role()='owner')
with check (not is_test_data or private.current_crm_role()='owner');

drop policy if exists inquiries_test_data_isolation_select on public.inquiries;
create policy inquiries_test_data_isolation_select on public.inquiries as restrictive
for select to authenticated using (not is_test_data or private.current_crm_role()='owner');
drop policy if exists inquiries_test_data_isolation_update on public.inquiries;
create policy inquiries_test_data_isolation_update on public.inquiries as restrictive
for update to authenticated
using (not is_test_data or private.current_crm_role()='owner')
with check (not is_test_data or private.current_crm_role()='owner');

do $$
declare
  target_profile_id constant uuid := '010ed7a4-3624-43cc-87f7-fe51655de257';
  target_inquiry_id constant uuid := 'b175fd07-3e21-4060-aeda-e3c869c11847';
  target_company_id constant uuid := 'f81a37ca-6a24-4010-b3e6-247be0f7c2c7';
  target_contact_id constant uuid := '4f40a384-2d07-4785-a864-f277f8017b27';
  isolation_reason constant text := '项目负责人于 2026-09-21 明确批准：生产验收合成数据安全隔离；保留历史证据，不计入经营、提醒和风险统计';
  before_profile jsonb;
  before_inquiry jsonb;
  before_company jsonb;
  before_contact jsonb;
  before_case jsonb;
  target_case record;
begin
  select to_jsonb(p) into strict before_profile from public.profiles p
  where p.id=target_profile_id and p.email='crm-e2e@wangligroup.com'
    and p.full_name='CRM 验收测试员' and p.team='测试';
  select to_jsonb(i) into strict before_inquiry from public.inquiries i
  where i.id=target_inquiry_id and i.inquiry_no=80
    and i.owner_id=target_profile_id
    and i.title='RFQ-CRM-20260917-A: 12 Steel Security Doors for Training Center'
    and i.company_id=target_company_id and i.contact_id=target_contact_id;
  select to_jsonb(c) into strict before_company from public.companies c where c.id=target_company_id;
  select to_jsonb(c) into strict before_contact from public.contacts c
  where c.id=target_contact_id and c.company_id=target_company_id;

  -- A manually executed production migration may later be replayed by a
  -- migration runner. Treat the fully verified final state as success, while
  -- deliberately refusing to continue from a partially applied state.
  if exists(
      select 1 from public.profiles
      where id=target_profile_id and active=false and is_test_data and data_environment='test'
    ) and exists(
      select 1 from public.companies
      where id=target_company_id and is_test_data and data_environment='test'
    ) and exists(
      select 1 from public.contacts
      where id=target_contact_id and is_test_data and data_environment='test'
    ) and exists(
      select 1 from public.inquiries
      where id=target_inquiry_id and validity='invalid' and excluded_from_dashboard
        and is_test_data and data_environment='test'
    ) and exists(
      select 1 from public.risk_cases
      where inquiry_id=target_inquiry_id
        and rule_key='business.first_response_overdue'
        and severity='p1' and status='false_positive'
    ) and not exists(
      select 1 from public.data_quality_alerts
      where inquiry_id=target_inquiry_id and resolved_at is null
    ) and not exists(
      select 1 from public.email_reply_reminders
      where inquiry_id=target_inquiry_id and status='open'
    ) then
    return;
  end if;

  if exists(select 1 from public.inquiries i where i.company_id=target_company_id and i.id<>target_inquiry_id) then
    raise exception '验收公司已被其他询盘使用，拒绝自动隔离';
  end if;
  if exists(select 1 from public.inquiries i where i.contact_id=target_contact_id and i.id<>target_inquiry_id) then
    raise exception '验收联系人已被其他询盘使用，拒绝自动隔离';
  end if;
  if exists(
    select 1 from public.risk_user_controls c join public.risk_cases r on r.id=c.source_case_id
    where r.inquiry_id=target_inquiry_id
      and (c.export_suspended or c.download_suspended or c.sensitive_reveal_suspended)
  ) then
    raise exception '验收风险仍有活动控制，必须先由风险负责人复验';
  end if;
  if (select count(*) from public.risk_cases r where r.inquiry_id=target_inquiry_id and r.status not in ('resolved','false_positive'))<>1
     or not exists(
       select 1 from public.risk_cases r where r.inquiry_id=target_inquiry_id
         and r.rule_key='business.first_response_overdue' and r.severity='p1' and r.status='open'
     ) then
    raise exception '验收风险案件状态已变化，拒绝自动关闭';
  end if;

  update public.profiles
  set active=false,is_test_data=true,data_environment='test'
  where id=target_profile_id;
  update public.companies
  set is_test_data=true,data_environment='test',updated_at=clock_timestamp()
  where id=target_company_id;
  update public.contacts
  set is_test_data=true,data_environment='test',updated_at=clock_timestamp()
  where id=target_contact_id;

  -- Business guards correctly reject ordinary users. This asserted migration
  -- disables only inquiry user triggers and writes every side effect explicitly.
  alter table public.inquiries disable trigger user;
  update public.inquiries
  set validity='invalid',invalid_reason=isolation_reason,
      excluded_from_dashboard=true,dashboard_exclusion_reason='生产验收测试数据',
      last_change_reason=isolation_reason,is_test_data=true,data_environment='test',
      updated_at=clock_timestamp()
  where id=target_inquiry_id;
  alter table public.inquiries enable trigger user;

  update public.data_quality_alerts
  set resolved_at=coalesce(resolved_at,clock_timestamp()),updated_at=clock_timestamp()
  where inquiry_id=target_inquiry_id and resolved_at is null;
  update public.email_reply_reminders
  set status='dismissed',updated_at=clock_timestamp()
  where inquiry_id=target_inquiry_id and status='open';
  update public.notifications
  set read_at=coalesce(read_at,clock_timestamp())
  where inquiry_id=target_inquiry_id or recipient_id=target_profile_id;

  for target_case in
    select * from public.risk_cases r
    where r.inquiry_id=target_inquiry_id and r.rule_key='business.first_response_overdue'
      and r.severity='p1' and r.status='open'
    for update
  loop
    before_case:=to_jsonb(target_case);
    update public.risk_cases
    set status='false_positive',resolution=isolation_reason,resolved_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=target_case.id;
    insert into public.risk_case_events(case_id,actor_id,event_type,reason,before_data,after_data)
    values(target_case.id,null,'false_positive',isolation_reason,
      jsonb_build_object('status',target_case.status,'severity',target_case.severity),
      jsonb_build_object('status','false_positive','classification','production_acceptance_fixture'));
    insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
    values(null,'risk_case',target_case.id,'risk_case_false_positive',before_case,
      jsonb_build_object('status','false_positive','inquiry_id',target_inquiry_id),isolation_reason);
  end loop;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason) values
    (null,'profile',target_profile_id,'test_data_quarantined',before_profile,
      (select to_jsonb(p) from public.profiles p where p.id=target_profile_id),isolation_reason),
    (null,'company',target_company_id,'test_data_quarantined',before_company,
      (select to_jsonb(c) from public.companies c where c.id=target_company_id),isolation_reason),
    (null,'contact',target_contact_id,'test_data_quarantined',before_contact,
      (select to_jsonb(c) from public.contacts c where c.id=target_contact_id),isolation_reason),
    (null,'inquiry',target_inquiry_id,'test_data_quarantined',before_inquiry,
      (select to_jsonb(i) from public.inquiries i where i.id=target_inquiry_id),isolation_reason);
end;
$$;

commit;
