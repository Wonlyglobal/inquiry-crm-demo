begin;

create or replace function private.assign_legacy_project_owner()
returns trigger language plpgsql security definer set search_path=''
as $$
declare matched_owner uuid;
declare matched_count integer;
begin
  if nullif(btrim(new.legacy_owner_name),'') is null then
    new.owner_id:=null;
    return new;
  end if;
  select min(p.id::text)::uuid,count(*) into matched_owner,matched_count from public.profiles p
  where lower(btrim(p.full_name))=lower(btrim(new.legacy_owner_name))
    and p.active=true and p.role='sales'
    and not coalesce(p.is_test_data,false)
    and coalesce(p.data_environment,'production')='production';
  if matched_count<>1 then
    raise exception '负责人“%”没有唯一可用的正式业务员账号',new.legacy_owner_name;
  end if;
  new.owner_id:=matched_owner;
  return new;
end;
$$;

drop trigger if exists assign_legacy_project_owner_before_write on public.legacy_engineering_projects;
create trigger assign_legacy_project_owner_before_write
before insert or update of legacy_owner_name on public.legacy_engineering_projects
for each row execute function private.assign_legacy_project_owner();

create or replace function public.import_legacy_engineering_projects(p_rows jsonb,p_source_file text)
returns integer language plpgsql security definer set search_path='' as $$
declare imported integer;
begin
  if private.current_crm_role()<>'owner' then raise exception '仅资料管理员（老板角色）可导入历史工程'; end if;
  imported:=private.import_legacy_engineering_projects(p_rows,p_source_file);
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data)
  values(auth.uid(),'profile',auth.uid(),'legacy_customer_projects_imported','导入历史成交与发货客户项目',jsonb_build_object(
    'source_file',left(coalesce(p_source_file,'Excel 导入'),255),'row_count',imported,
    'owner_mapping','active_production_sales_exact_name','customer_content_in_audit',false
  ));
  return imported;
end;
$$;

revoke all on function public.import_legacy_engineering_projects(jsonb,text) from public,anon;
grant execute on function public.import_legacy_engineering_projects(jsonb,text) to authenticated;

notify pgrst,'reload schema';
commit;
