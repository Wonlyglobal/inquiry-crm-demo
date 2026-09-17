begin;

do $$
declare
  actor_id uuid;
  intake_id uuid;
  suggestion_id uuid;
begin
  select p.id into actor_id
  from public.profiles p
  where p.active and p.role in ('owner','sales_manager','marketing')
  order by case p.role when 'owner' then 1 when 'sales_manager' then 2 else 3 end,p.created_at
  limit 1;
  select e.id into intake_id
  from public.email_intake e
  where e.trashed_at is null
  order by e.created_at desc
  limit 1;
  if actor_id is null or intake_id is null then
    raise exception 'AI suggestion rollback test requires one active reviewer and one non-trashed email intake';
  end if;

  insert into public.ai_suggestions(
    suggestion_type,target_type,target_id,source_hash,provider,model,confidence,
    proposed_data,evidence,rationale_zh,requested_by
  ) values(
    'rollback_ai_triage_test','email_intake',intake_id,
    'rollback-ai-suggestion-20260917','rollback-test','rollback-test',0.8,
    '{"classification":"real_inquiry"}'::jsonb,
    '[{"field":"subject","quote":"rollback evidence"}]'::jsonb,
    '生产回滚验收建议',actor_id
  ) returning id into suggestion_id;

  perform set_config('crm.ai_test_actor',actor_id::text,true);
  perform set_config('crm.ai_test_intake',intake_id::text,true);
  perform set_config('crm.ai_test_suggestion',suggestion_id::text,true);
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub',current_setting('crm.ai_test_actor'),'role','authenticated')::text,
  true
);
set local role authenticated;

do $$
declare result jsonb;
begin
  select public.review_ai_suggestion(
    current_setting('crm.ai_test_suggestion')::uuid,
    'modified',
    '{"classification":"warmup"}'::jsonb,
    '生产回滚验收：人工修正'
  ) into result;
  if result->>'status'<>'modified' then
    raise exception 'review RPC returned unexpected result: %',result;
  end if;

  begin
    insert into public.ai_suggestions(
      suggestion_type,target_type,target_id,source_hash,provider,model,confidence,requested_by
    ) values(
      'forbidden_direct_write','email_intake',current_setting('crm.ai_test_intake')::uuid,
      'forbidden-direct-write-20260917','test','test',0.1,current_setting('crm.ai_test_actor')::uuid
    );
    raise exception 'authenticated direct AI suggestion write was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

do $$
begin
  if not exists(
    select 1 from public.ai_suggestions s
    where s.id=current_setting('crm.ai_test_suggestion')::uuid
      and s.status='modified'
      and s.reviewed_by=current_setting('crm.ai_test_actor')::uuid
      and s.applied_data->>'classification'='warmup'
  ) then
    raise exception 'AI suggestion review was not persisted';
  end if;
  if not exists(
    select 1 from public.audit_logs a
    where a.actor_id=current_setting('crm.ai_test_actor')::uuid
      and a.entity_type='email_intake'
      and a.entity_id=current_setting('crm.ai_test_intake')::uuid
      and a.action='ai_suggestion_reviewed'
  ) then
    raise exception 'AI suggestion review audit was not persisted';
  end if;
end $$;

rollback;
select 'ai_suggestion_feedback_rollback_passed' as result;
