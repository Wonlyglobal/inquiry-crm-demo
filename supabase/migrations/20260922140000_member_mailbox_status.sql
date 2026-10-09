-- User requested mailbox connection state in the all-member directory. Status only.
begin;
create function public.get_crm_member_mailbox_status()
returns table(profile_id uuid,connection_status text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles a where a.id=auth.uid() and a.active=true
 and a.role in ('owner','sales_manager','marketing') and a.is_test_data=false and a.data_environment='production') then
 raise exception '当前账号无权查看成员邮箱状态'; end if;
 return query select p.id,
 case when c.user_id is null then 'not_connected'
 when c.status::text in ('connected','error','disabled','pending') then c.status::text
 else 'unknown' end
 from public.profiles p left join public.mailbox_connections c on c.user_id=p.id and c.mailbox_kind='personal'
 where p.is_test_data=false and p.data_environment='production' order by p.id;
end $$;
revoke all on function public.get_crm_member_mailbox_status() from public,anon;
grant execute on function public.get_crm_member_mailbox_status() to authenticated;
comment on function public.get_crm_member_mailbox_status() is 'Approved directory connection state only; excludes credentials, error details, mail content and configuration.';
commit;
