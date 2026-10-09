-- User authorized all formal members in manager/marketing settings; directory only.
begin;
create function public.get_crm_member_directory()
returns table(id uuid,full_name text,email text,role text,team text,job_title text,active boolean,sales_region text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles actor where actor.id=auth.uid() and actor.active=true
   and actor.role in ('owner','sales_manager','marketing') and actor.is_test_data=false and actor.data_environment='production') then
  raise exception '当前账号无权查看成员目录';
 end if;
 return query select p.id,p.full_name::text,p.email::text,p.role::text,p.team::text,p.job_title::text,p.active,
   coalesce((select string_agg(distinct t.sales_region,'、' order by t.sales_region) from public.sales_target_people t where t.profile_id=p.id),'—')
 from public.profiles p where p.is_test_data=false and p.data_environment='production'
 order by p.full_name,p.id;
end $$;
revoke all on function public.get_crm_member_directory() from public,anon;
grant execute on function public.get_crm_member_directory() to authenticated;
comment on function public.get_crm_member_directory() is 'All formal member basic directory approved by project owner; no customer, mailbox, credential or account mutation access.';
commit;
