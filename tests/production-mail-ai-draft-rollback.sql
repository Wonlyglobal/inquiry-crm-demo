-- Production-safe proof for persistent, owner-private AI mail drafts.
-- Run as a privileged database operator. Every write is rolled back.
begin;

do $$
declare
  test_author uuid;
  draft_id uuid;
begin
  select p.id into test_author from public.profiles p
  where p.active=true and p.role in ('owner','sales_manager','marketing','sales')
  order by p.created_at limit 1;
  if test_author is null then raise exception 'NO_AI_DRAFT_TEST_AUTHOR'; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  select public.record_email_ai_draft(test_author,null,null,'translate','English',
    'Production rollback AI draft','This draft is created only inside a rollback transaction.',
    '生产回滚验证','') into draft_id;
  if draft_id is null or not exists(select 1 from public.email_ai_drafts d where d.id=draft_id and d.author_id=test_author)
    then raise exception 'AI_DRAFT_NOT_RECORDED'; end if;
  if not exists(select 1 from public.audit_logs a where a.actor_id=test_author and a.action='mail_ai_draft_generated' and a.after_data->>'draft_id'=draft_id::text)
    then raise exception 'AI_DRAFT_AUDIT_NOT_RECORDED'; end if;
end;
$$;

rollback;

select concat(
  'table=',to_regclass('public.email_ai_drafts') is not null,
  '; function=',to_regprocedure('public.record_email_ai_draft(uuid,uuid,uuid,text,text,text,text,text,text)') is not null,
  '; anon_execute=',has_function_privilege('anon','public.record_email_ai_draft(uuid,uuid,uuid,text,text,text,text,text,text)','execute'),
  '; authenticated_execute=',has_function_privilege('authenticated','public.record_email_ai_draft(uuid,uuid,uuid,text,text,text,text,text,text)','execute'),
  '; service_execute=',has_function_privilege('service_role','public.record_email_ai_draft(uuid,uuid,uuid,text,text,text,text,text,text)','execute'),
  '; authenticated_insert=',has_table_privilege('authenticated','public.email_ai_drafts','insert'),
  '; rollback_drafts=',(select count(*) from public.email_ai_drafts where subject='Production rollback AI draft')
) as production_mail_ai_draft_persistence;
