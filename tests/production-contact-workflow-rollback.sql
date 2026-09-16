-- Production-safe proof for audited contact avatar updates.
-- Run as a privileged database operator. Every test write is rolled back.
begin;

do $$
declare
  test_actor_id uuid;
  target_contact uuid;
  test_path text;
  saved public.contacts;
  invalid_rejected boolean:=false;
begin
  select p.id into test_actor_id
  from public.profiles p
  where p.active=true and p.role in ('owner','sales_manager','marketing')
  order by p.created_at limit 1;
  if test_actor_id is null then raise exception 'NO_CONTACT_TEST_ACTOR'; end if;

  select c.id into target_contact
  from public.contacts c
  order by c.created_at limit 1;
  if target_contact is null then raise exception 'NO_CONTACT_TEST_RECORD'; end if;

  test_path:=test_actor_id::text||'/contacts/'||target_contact::text||'/avatar-rollback-test.png';
  insert into storage.objects(bucket_id,name)
  values('profile-avatars',test_path);

  perform set_config('request.jwt.claim.sub',test_actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select * into saved from public.set_customer_contact_avatar(target_contact,test_path);
  if saved.avatar_url is distinct from test_path then
    raise exception 'CONTACT_AVATAR_NOT_SAVED';
  end if;
  if not exists (
    select 1 from public.audit_logs a
    where a.actor_id=test_actor_id and a.entity_id=target_contact
      and a.action='contact_avatar_updated'
  ) then raise exception 'CONTACT_AVATAR_AUDIT_MISSING'; end if;

  begin
    perform public.set_customer_contact_avatar(
      target_contact,test_actor_id::text||'/contacts/'||target_contact::text||'/../invalid.png'
    );
  exception when others then
    invalid_rejected:=sqlerrm like '%头像路径无效%';
  end;
  if not invalid_rejected then raise exception 'INVALID_CONTACT_AVATAR_PATH_ACCEPTED'; end if;
end;
$$;

rollback;

select concat(
  'function=',to_regprocedure('public.set_customer_contact_avatar(uuid,text)') is not null,
  '; anon_execute=',has_function_privilege('anon','public.set_customer_contact_avatar(uuid,text)','execute'),
  '; authenticated_execute=',has_function_privilege('authenticated','public.set_customer_contact_avatar(uuid,text)','execute'),
  '; authenticated_insert=',has_table_privilege('authenticated','public.contacts','insert'),
  '; authenticated_update=',has_table_privilege('authenticated','public.contacts','update'),
  '; authenticated_delete=',has_table_privilege('authenticated','public.contacts','delete'),
  '; rollback_objects=',(select count(*) from storage.objects where name like '%/avatar-rollback-test.png'),
  '; rollback_audits=',(select count(*) from public.audit_logs where action='contact_avatar_updated' and after_data->>'avatar_url' like '%/avatar-rollback-test.png')
) as production_contact_workflow;
