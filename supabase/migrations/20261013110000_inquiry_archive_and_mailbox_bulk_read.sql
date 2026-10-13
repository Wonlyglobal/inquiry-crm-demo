-- Reversible inquiry archive and bounded, owner-only CRM mailbox bulk-read.
-- These flows retain inquiry/email records and do not change provider mailbox flags.
begin;

alter table public.inquiries
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;
alter table public.inquiries drop constraint if exists inquiries_archive_reason_length_check;
alter table public.inquiries add constraint inquiries_archive_reason_length_check
  check (archive_reason is null or char_length(btrim(archive_reason)) between 8 and 1000);

drop policy if exists inquiries_read on public.inquiries;
create policy inquiries_read on public.inquiries for select to authenticated
using (archived_at is null and (
  private.current_crm_role() in ('owner','sales_manager','marketing')
  or owner_id=(select auth.uid())
));

create or replace function private.guard_inquiry_archive_fields()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.archived_at is distinct from old.archived_at
    or new.archived_by is distinct from old.archived_by
    or new.archive_reason is distinct from old.archive_reason then
    if coalesce(current_setting('app.inquiry_archive_rpc',true),'')<>'on' then
      raise exception '询盘归档状态必须通过受控回收站流程修改';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_inquiry_archive_fields() from public,anon,authenticated;
drop trigger if exists inquiries_guard_archive_fields on public.inquiries;
create trigger inquiries_guard_archive_fields before update on public.inquiries
for each row execute function private.guard_inquiry_archive_fields();

create or replace function public.archive_inquiry(target_inquiry_id uuid, archive_reason text)
returns timestamptz language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item public.inquiries;
  archived_time timestamptz:=clock_timestamp();
  reason_value text:=nullif(btrim(archive_reason),'');
begin
  if actor is null or private.current_crm_role() is distinct from 'owner' then raise exception '仅老板角色可将询盘移入回收站'; end if;
  if reason_value is null or char_length(reason_value)<8 or char_length(reason_value)>1000 then raise exception '归档原因必须为 8 至 1000 个字'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found or item.archived_at is not null then raise exception '询盘不存在或已归档'; end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor,'inquiry',item.id,'inquiry_archived',
    jsonb_build_object('archived_at',item.archived_at,'archived_by',item.archived_by),
    jsonb_build_object('archived_at',archived_time,'archived_by',actor),reason_value);
  perform set_config('app.inquiry_archive_rpc','on',true);
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set archived_at=archived_time,archived_by=actor,archive_reason=reason_value,
    updated_by=actor,updated_at=archived_time,last_change_reason='移入询盘回收站：'||reason_value
  where id=item.id;
  return archived_time;
end;
$$;

create or replace function public.restore_inquiry_from_archive(target_inquiry_id uuid, restoration_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item public.inquiries;
  reason_value text:=nullif(btrim(restoration_reason),'');
begin
  if actor is null or private.current_crm_role() is distinct from 'owner' then raise exception '仅老板角色可恢复回收站询盘'; end if;
  if reason_value is null or char_length(reason_value)<8 or char_length(reason_value)>1000 then raise exception '恢复原因必须为 8 至 1000 个字'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found or item.archived_at is null then raise exception '回收站中没有该询盘'; end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor,'inquiry',item.id,'inquiry_restored',
    jsonb_build_object('archived_at',item.archived_at,'archived_by',item.archived_by,'archive_reason',item.archive_reason),
    jsonb_build_object('archived_at',null,'archived_by',null),reason_value);
  perform set_config('app.inquiry_archive_rpc','on',true);
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set archived_at=null,archived_by=null,archive_reason=null,
    updated_by=actor,updated_at=clock_timestamp(),last_change_reason='从询盘回收站恢复：'||reason_value
  where id=item.id;
end;
$$;

create or replace function public.list_archived_inquiries()
returns table(id uuid,inquiry_no text,title text,archived_at timestamptz,archive_reason text,archived_by_name text,owner_name text)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or private.current_crm_role() is distinct from 'owner' then raise exception '仅老板角色可查看询盘回收站'; end if;
  return query
  select i.id,i.inquiry_no::text,i.title,i.archived_at,i.archive_reason,a.full_name,o.full_name
  from public.inquiries i
  left join public.profiles a on a.id=i.archived_by
  left join public.profiles o on o.id=i.owner_id
  where i.archived_at is not null order by i.archived_at desc;
end;
$$;

create or replace function public.mark_my_mailbox_messages_read(target_message_ids uuid[])
returns integer language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  actor_role public.crm_role;
  requested_count integer;
  matched_count integer;
  inserted_count integer;
  read_time timestamptz:=clock_timestamp();
begin
  select p.role into actor_role from public.profiles p where p.id=actor and p.active=true;
  if actor is null or actor_role is null or actor_role not in ('owner','sales_manager','marketing','sales') then
    raise exception '当前账号无权标记邮箱已读';
  end if;
  if target_message_ids is null or cardinality(target_message_ids)=0 or cardinality(target_message_ids)>200 then
    raise exception '一次只能标记 1 至 200 封邮件';
  end if;
  select count(distinct requested.id) into requested_count from unnest(target_message_ids) as requested(id);
  if requested_count<>cardinality(target_message_ids) then raise exception '邮件列表包含重复或空 ID'; end if;
  select count(distinct m.id) into matched_count
  from public.email_messages m
  join public.mailbox_connections mc on mc.id=m.mailbox_connection_id
  where m.id=any(target_message_ids) and m.direction='inbound'
    and mc.user_id=actor and mc.mailbox_kind='personal';
  if matched_count<>requested_count then raise exception '仅能标记本人个人邮箱收件箱中的邮件'; end if;
  with inserted as (
    insert into public.email_message_reads(email_message_id,user_id,read_at)
    select unnest(target_message_ids),actor,read_time
    on conflict(email_message_id,user_id) do nothing
    returning email_message_id
  ), audited as (
    insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
    select actor,'email_message',r.email_message_id,'email_message_read',
      jsonb_build_object('read_at',read_time,'source','bulk'),'用户在 CRM 邮箱批量标记为已读'
    from inserted r returning entity_id
  )
  select count(*) into inserted_count from audited;
  return inserted_count;
end;
$$;

revoke all on function public.archive_inquiry(uuid,text) from public,anon;
revoke all on function public.restore_inquiry_from_archive(uuid,text) from public,anon;
revoke all on function public.list_archived_inquiries() from public,anon;
revoke all on function public.mark_my_mailbox_messages_read(uuid[]) from public,anon;
grant execute on function public.archive_inquiry(uuid,text) to authenticated;
grant execute on function public.restore_inquiry_from_archive(uuid,text) to authenticated;
grant execute on function public.list_archived_inquiries() to authenticated;
grant execute on function public.mark_my_mailbox_messages_read(uuid[]) to authenticated;
commit;
