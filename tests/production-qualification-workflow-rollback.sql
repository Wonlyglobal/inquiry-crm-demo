-- Production-safe proof for role-scoped qualification and manager confirmation.
-- Run the whole file as a privileged database operator. Every write is rolled back.
begin;

do $$
declare
  target_inquiry uuid;
  manager_id uuid;
  blocked_message text;
  saved jsonb;
begin
  select i.id into target_inquiry from public.inquiries i
  where i.status not in ('won','lost') order by i.created_at desc limit 1;
  select p.id into manager_id from public.profiles p
  where p.active=true and p.role in ('owner','sales_manager') order by p.role limit 1;
  if target_inquiry is null or manager_id is null then raise exception 'NO_QUALIFICATION_TEST_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',manager_id::text,true);

  begin
    update public.inquiries set qualification_need='rollback bypass' where id=target_inquiry;
    raise exception 'DIRECT_QUALIFICATION_BYPASS_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='DIRECT_QUALIFICATION_BYPASS_NOT_BLOCKED'
      or position('必须通过分角色的服务端流程' in blocked_message)=0 then raise; end if;
  end;

  select public.save_inquiry_qualification(
    target_inquiry,'已核验企业身份','已确认客户需求','已确认联系人角色','已确认项目价值',
    '已确认采购时间','已确认产品匹配','已确认下一步','P1','生产回滚验证：主管完成资格定级'
  ) into saved;
  if coalesce((saved->>'qualification_score')::integer,0)<>100
    or saved->>'lead_priority'<>'P1'
    or nullif(saved->>'qualification_manager_confirmed_at','') is null
    or saved->>'qualification_manager_confirmed_by'<>manager_id::text then
    raise exception 'MANAGER_CONFIRMATION_NOT_RECORDED';
  end if;
  if not exists(select 1 from public.audit_logs where entity_id=target_inquiry
    and actor_id=manager_id and action='qualification_updated') then
    raise exception 'QUALIFICATION_AUDIT_NOT_RECORDED';
  end if;
end;
$$;

rollback;

select concat(
  'function=',to_regprocedure('public.save_inquiry_qualification(uuid,text,text,text,text,text,text,text,text,text)') is not null,
  '; trigger=',exists(select 1 from pg_trigger where tgname='inquiries_enforce_qualification_workflow' and not tgisinternal),
  '; anon_execute=',has_function_privilege('anon','public.save_inquiry_qualification(uuid,text,text,text,text,text,text,text,text,text)','execute'),
  '; authenticated_execute=',has_function_privilege('authenticated','public.save_inquiry_qualification(uuid,text,text,text,text,text,text,text,text,text)','execute'),
  '; rollback_audits=',(select count(*) from public.audit_logs where reason='生产回滚验证：主管完成资格定级')
) as production_qualification_workflow;
