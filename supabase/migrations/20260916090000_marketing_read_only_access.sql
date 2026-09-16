-- Dedicated NOLOGIN role: no membership in authenticated, no business writes.
-- Existing member grants, policies and the authenticator request hook stay unchanged.
begin;
create role crm_marketing_readonly nologin noinherit;
grant crm_marketing_readonly to authenticator;
grant usage on schema public, private, storage to crm_marketing_readonly;
-- Auth schema is managed by Supabase; read only signed request claims without
-- modifying its grants or inheriting authenticated's write privileges.
create function private.crm_readonly_uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid
$$;
create function private.crm_readonly_jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
revoke all on function private.crm_readonly_uid(), private.crm_readonly_jwt() from public,anon,authenticated;
grant execute on function private.crm_readonly_uid(), private.crm_readonly_jwt() to crm_marketing_readonly;
grant execute on function private.current_crm_role(), private.can_read_fulfillment(uuid) to crm_marketing_readonly;
grant execute on function storage.foldername(text), storage.filename(text), storage.extension(text) to crm_marketing_readonly;
grant execute on function public.get_shared_inquiry_mailbox_status() to crm_marketing_readonly;

-- Copy only existing authenticated SELECT visibility, never write privileges.
-- Preserve permissive/restrictive semantics. All added policies target only the new role.
do $$
declare item record;
begin
  for item in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' or (n.nspname='storage' and c.relname in ('objects','buckets'))) and c.relkind in ('r','p','v','m')
      and has_table_privilege('authenticated',c.oid,'SELECT')
  loop
    execute format('grant select on %I.%I to crm_marketing_readonly',item.nspname,item.relname);
  end loop;
  for item in select * from pg_policies where schemaname in ('public','storage')
    and cmd in ('SELECT','ALL') and 'authenticated'=any(roles)
  loop
    execute format('create policy %I on %I.%I as %s for select to crm_marketing_readonly using (%s)',
      'crm_ro_'||substr(md5(item.schemaname||item.tablename||item.policyname),1,24),
      item.schemaname,item.tablename,item.permissive,
      replace(replace(coalesce(item.qual,'true'),'auth.uid()','private.crm_readonly_uid()'),'auth.jwt()','private.crm_readonly_jwt()'));
  end loop;
end $$;

-- The only permitted write completes this user's own initial-password workflow.
create function public.finish_readonly_initial_password_change()
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=auth.uid() and u.role='crm_marketing_readonly' and p.active
      and p.role='marketing' and u.raw_app_meta_data->>'crm_read_only'='true')
  then raise sqlstate '42501' using message='无权执行此操作'; end if;
  update public.profiles set must_change_password=false,updated_at=now() where id=auth.uid();
end $$;
revoke all on function public.finish_readonly_initial_password_change() from public,anon,authenticated;
grant execute on function public.finish_readonly_initial_password_change() to crm_marketing_readonly;
notify pgrst,'reload schema';
commit;
