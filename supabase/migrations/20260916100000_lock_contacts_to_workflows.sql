-- Contact records are customer master data. Browser users may read their
-- authorized scope, but creation and avatar changes must use audited RPCs.

drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
revoke insert,update,delete on public.contacts from authenticated;

create or replace function public.set_customer_contact_avatar(
  target_contact_id uuid,
  avatar_path text
)
returns public.contacts
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid:=auth.uid();
  actor_role public.crm_role;
  current_contact public.contacts;
  saved public.contacts;
  normalized_path text:=trim(avatar_path);
begin
  if actor_id is null then raise exception '请先登录'; end if;
  select p.role into actor_role
  from public.profiles p
  where p.id=actor_id and p.active=true;
  if actor_role is null then raise exception '当前账号无权更新联系人头像'; end if;

  select c.* into current_contact
  from public.contacts c
  where c.id=target_contact_id
  for update;
  if not found then raise exception '联系人不存在'; end if;

  if not (
    actor_role in ('owner','sales_manager','marketing')
    or exists (
      select 1 from public.inquiries i
      where i.company_id=current_contact.company_id and i.owner_id=actor_id
    )
    or (
      current_contact.created_by=actor_id
      and not exists (
        select 1 from public.inquiries i
        where i.company_id=current_contact.company_id
      )
    )
  ) then
    raise exception '无权更新该联系人头像';
  end if;

  if normalized_path is null
     or normalized_path not like actor_id::text||'/contacts/'||target_contact_id::text||'/avatar-%'
     or normalized_path !~ '[.](jpg|png|webp)$'
     or normalized_path like '%..%'
  then
    raise exception '联系人头像路径无效';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='profile-avatars' and o.name=normalized_path
  ) then
    raise exception '联系人头像文件不存在';
  end if;

  update public.contacts
  set avatar_url=normalized_path,updated_at=clock_timestamp()
  where id=target_contact_id
  returning * into saved;

  insert into public.audit_logs(
    actor_id,entity_type,entity_id,action,before_data,after_data,reason
  ) values (
    actor_id,'contact',target_contact_id,'contact_avatar_updated',
    jsonb_build_object('avatar_url',current_contact.avatar_url),
    jsonb_build_object('avatar_url',saved.avatar_url),
    '更新客户联系人头像'
  );

  return saved;
end;
$$;

revoke all on function public.set_customer_contact_avatar(uuid,text) from public,anon;
grant execute on function public.set_customer_contact_avatar(uuid,text) to authenticated;

notify pgrst, 'reload schema';
