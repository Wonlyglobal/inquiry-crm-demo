-- Customer database contact access and audited contact creation.

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.companies c
    where c.id = contacts.company_id
      and (
        private.current_crm_role() in ('owner','sales_manager','marketing')
        or c.created_by = (select auth.uid())
        or exists (
          select 1 from public.inquiries i
          where i.company_id = c.id and i.owner_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists contacts_read on public.contacts;
create policy contacts_read on public.contacts
for select to authenticated
using (
  private.current_crm_role() in ('owner','sales_manager','marketing')
  or created_by = (select auth.uid())
  or exists (
    select 1
    from public.inquiries i
    where i.company_id = contacts.company_id
      and i.owner_id = (select auth.uid())
  )
);

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
for update to authenticated
using (
  private.current_crm_role() in ('owner','sales_manager','marketing')
  or created_by = (select auth.uid())
  or exists (
    select 1
    from public.inquiries i
    where i.company_id = contacts.company_id
      and i.owner_id = (select auth.uid())
  )
)
with check (
  private.current_crm_role() in ('owner','sales_manager','marketing')
  or created_by = (select auth.uid())
  or exists (
    select 1
    from public.inquiries i
    where i.company_id = contacts.company_id
      and i.owner_id = (select auth.uid())
  )
);

create or replace function public.add_customer_contact(
  target_company_id uuid,
  contact_name text,
  contact_email text default null,
  contact_phone text default null,
  contact_whatsapp text default null,
  contact_job_title text default null,
  contact_linkedin_url text default null,
  change_reason text default null
)
returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.crm_role;
  saved public.contacts;
  normalized_email text := nullif(lower(trim(contact_email)), '');
begin
  if actor_id is null then
    raise exception '请先登录';
  end if;

  select p.role into actor_role
  from public.profiles p
  where p.id = actor_id and p.active = true;

  if actor_role is null then
    raise exception '当前账号无权新增联系人';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = target_company_id
      and (
        actor_role in ('owner','sales_manager','marketing')
        or c.created_by = actor_id
        or exists (
          select 1 from public.inquiries i
          where i.company_id = c.id and i.owner_id = actor_id
        )
      )
  ) then
    raise exception '无权为该客户新增联系人';
  end if;

  if nullif(trim(contact_name), '') is null then
    raise exception '联系人姓名不能为空';
  end if;
  if normalized_email is null
     and nullif(trim(contact_phone), '') is null
     and nullif(trim(contact_whatsapp), '') is null then
    raise exception '邮箱、电话或 WhatsApp 至少填写一项';
  end if;
  if normalized_email is not null
     and normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception '联系人邮箱格式不正确';
  end if;
  if nullif(trim(change_reason), '') is null then
    raise exception '请填写新增联系人依据';
  end if;
  if normalized_email is not null and exists (
    select 1 from public.contacts c
    where c.company_id = target_company_id and lower(c.email) = normalized_email
  ) then
    raise exception '该客户下已存在相同邮箱的联系人';
  end if;

  insert into public.contacts(
    company_id, full_name, email, phone, whatsapp, job_title, linkedin_url, created_by
  ) values (
    target_company_id,
    trim(contact_name),
    normalized_email,
    nullif(trim(contact_phone), ''),
    nullif(trim(contact_whatsapp), ''),
    nullif(trim(contact_job_title), ''),
    nullif(trim(contact_linkedin_url), ''),
    actor_id
  ) returning * into saved;

  insert into public.audit_logs(
    actor_id, entity_type, entity_id, action, before_data, after_data, reason
  ) values (
    actor_id,
    'contact',
    saved.id,
    'contact_created',
    '{}'::jsonb,
    jsonb_build_object(
      'company_id', saved.company_id,
      'full_name', saved.full_name,
      'email', saved.email,
      'phone', saved.phone,
      'whatsapp', saved.whatsapp,
      'job_title', saved.job_title,
      'linkedin_url', saved.linkedin_url
    ),
    trim(change_reason)
  );

  return saved;
end;
$$;

revoke all on function public.add_customer_contact(uuid,text,text,text,text,text,text,text) from public;
revoke all on function public.add_customer_contact(uuid,text,text,text,text,text,text,text) from anon;
grant execute on function public.add_customer_contact(uuid,text,text,text,text,text,text,text) to authenticated;
