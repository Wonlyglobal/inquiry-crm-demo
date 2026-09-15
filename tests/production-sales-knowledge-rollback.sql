-- Production-safe proof for the role-gated, searchable sales knowledge workflow.
-- Run as a privileged database operator. Every write is rolled back.
begin;

create temp table knowledge_test_context(manager_id uuid,sales_id uuid) on commit drop;
insert into knowledge_test_context
select
  (select p.id from public.profiles p where p.active=true and p.role in ('owner','sales_manager','marketing') order by p.created_at limit 1),
  (select p.id from public.profiles p where p.active=true and p.role='sales' order by p.created_at limit 1);
grant select on knowledge_test_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select manager_id::text from knowledge_test_context),true);

do $$
declare
  actor_id uuid := auth.uid();
  article_id uuid;
begin
  if actor_id is null then raise exception 'NO_KNOWLEDGE_MANAGER_FIXTURE'; end if;
  insert into public.sales_knowledge_articles(category,title,summary,content,tags,language,created_by)
  values('faq','Production rollback knowledge article','Rollback-only acceptance evidence',
    'Verified knowledge content created only inside a rollback transaction.',array['rollback','acceptance'],'en',actor_id)
  returning id into article_id;
  update public.sales_knowledge_articles set summary='Updated rollback-only acceptance evidence' where id=article_id;
  if not exists(select 1 from public.audit_logs a where a.entity_id=article_id and a.action='insert' and a.reason='销售知识库内容变更')
    or not exists(select 1 from public.audit_logs a where a.entity_id=article_id and a.action='update' and a.reason='销售知识库内容变更')
  then raise exception 'KNOWLEDGE_AUDIT_NOT_RECORDED'; end if;
end;
$$;

select set_config('request.jwt.claim.sub',(select sales_id::text from knowledge_test_context),true);
do $$
declare
  blocked boolean := false;
  error_code text;
begin
  if auth.uid() is null then raise exception 'NO_KNOWLEDGE_SALES_FIXTURE'; end if;
  begin
    insert into public.sales_knowledge_articles(category,title,content,created_by)
    values('faq','Forbidden sales knowledge article','A salesperson must not publish authoritative shared content.',auth.uid());
  exception when others then
    get stacked diagnostics error_code=returned_sqlstate;
    blocked := error_code='42501';
  end;
  if not blocked then raise exception 'SALES_KNOWLEDGE_WRITE_NOT_BLOCKED'; end if;
end;
$$;

reset role;
rollback;

select concat(
  'table=',to_regclass('public.sales_knowledge_articles') is not null,
  '; authenticated_select=',has_table_privilege('authenticated','public.sales_knowledge_articles','select'),
  '; authenticated_insert=',has_table_privilege('authenticated','public.sales_knowledge_articles','insert'),
  '; anon_select=',has_table_privilege('anon','public.sales_knowledge_articles','select'),
  '; rollback_articles=',(select count(*) from public.sales_knowledge_articles where title in ('Production rollback knowledge article','Forbidden sales knowledge article'))
) as production_sales_knowledge;
