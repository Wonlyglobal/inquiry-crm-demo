begin;
insert into auth.users(id,email,role,raw_app_meta_data) values
('e006eee0-9840-4efc-a00b-a3ee7ab7b116','readonly-rollback@example.invalid','crm_marketing_readonly','{"crm_read_only":true}');
insert into public.profiles(id,email,full_name,role,active,must_change_password) values
('e006eee0-9840-4efc-a00b-a3ee7ab7b116','readonly-rollback@example.invalid','只读回滚测试','marketing',true,true);
select set_config('request.jwt.claims','{"sub":"e006eee0-9840-4efc-a00b-a3ee7ab7b116","role":"crm_marketing_readonly"}',true);
set local role crm_marketing_readonly;
do $$
declare item record;
begin
  perform count(*) from public.inquiries;
  perform count(*) from public.profiles;
  perform count(*) from public.email_intake;
  perform count(*) from public.sales_orders;
  perform count(*) from storage.objects;
  perform * from public.get_shared_inquiry_mailbox_status();
  for item in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' or (n.nspname='storage' and c.relname in ('objects','buckets'))) and c.relkind in ('r','p','v','m')
  loop
    if has_table_privilege(current_user,item.oid,'INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'unexpected write grant on %',item.relname;
    end if;
  end loop;
  for item in select p.oid,p.oid::regprocedure::text as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prosecdef and has_function_privilege(current_user,p.oid,'EXECUTE')
  loop
    if item.signature not in ('private.current_crm_role()','private.can_read_fulfillment(uuid)',
      'get_shared_inquiry_mailbox_status()','finish_readonly_initial_password_change()') then
      raise exception 'unexpected definer function access %',item.signature;
    end if;
  end loop;
  begin
    update public.profiles set full_name='不应写入' where id=private.crm_readonly_uid();
    raise exception 'profile write was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.triage_email_intakes(array[]::uuid[],'warmup');
    raise exception 'business RPC was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values('member-avatars','readonly-test');
    raise exception 'storage write was allowed';
  exception when insufficient_privilege then null; end;
  perform public.finish_readonly_initial_password_change();
  if (select must_change_password from public.profiles where id=private.crm_readonly_uid()) then
    raise exception 'initial password workflow failed';
  end if;
end $$;
reset role;
-- Assert equal complete visible row fingerprints for the same marketing identity.
-- No customer records or message bodies are emitted.
do $$
declare item record; standard_hash text; viewer_hash text; checked integer:=0;
begin
  for item in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' or (n.nspname='storage' and c.relname in ('objects','buckets'))) and c.relkind in ('r','p','v','m')
      and has_table_privilege('authenticated',c.oid,'SELECT')
  loop
    execute 'set local role authenticated';
    execute format($q$select md5(coalesce(string_agg(h, chr(10) order by h),'')) from (select md5(row_to_json(t)::text) as h from %I.%I t) q$q$,item.nspname,item.relname) into standard_hash;
    execute 'reset role';
    execute 'set local role crm_marketing_readonly';
    execute format($q$select md5(coalesce(string_agg(h, chr(10) order by h),'')) from (select md5(row_to_json(t)::text) as h from %I.%I t) q$q$,item.nspname,item.relname) into viewer_hash;
    execute 'reset role';
    if standard_hash is distinct from viewer_hash then raise exception 'visibility differs: %.%',item.nspname,item.relname; end if;
    checked:=checked+1;
  end loop;
  perform set_config('crm.read_only_checked_relations',checked::text,true);
end $$;
select current_setting('crm.read_only_checked_relations') as identical_marketing_relations;
rollback;
select 'dedicated_read_only_role_rollback_passed' as result;
