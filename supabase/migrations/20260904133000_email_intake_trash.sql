alter table public.email_intake
  add column if not exists trashed_at timestamptz,
  add column if not exists trashed_by uuid references public.profiles(id),
  add column if not exists pre_trash_status text,
  add column if not exists pre_trash_triage_label text;

create or replace function public.trash_email_intakes(target_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare changed integer;
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then
    raise exception '当前账号无权移动邮件到垃圾箱';
  end if;
  if exists(
    select 1 from public.email_intake e
    join public.inquiries i on i.id=e.inquiry_id
    where e.id=any(target_ids) and i.excluded_from_dashboard=false
  ) then
    raise exception '真实询盘关联邮件不能删除或移入垃圾箱';
  end if;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  select auth.uid(),'email_intake',e.id,'email_trashed',
    jsonb_build_object('triage_label',e.triage_label,'processing_status',e.processing_status,'trashed_at',e.trashed_at),
    jsonb_build_object('triage_label',e.triage_label,'processing_status',e.processing_status,'trashed_at',clock_timestamp()),
    '人工批量将邮件移入垃圾箱'
  from public.email_intake e where e.id=any(target_ids) and e.trashed_at is null;

  update public.email_intake
  set pre_trash_status=processing_status,pre_trash_triage_label=triage_label,
      trashed_at=clock_timestamp(),trashed_by=auth.uid(),updated_at=clock_timestamp()
  where id=any(target_ids) and trashed_at is null;
  get diagnostics changed=row_count;
  return changed;
end;
$$;

create or replace function public.restore_email_intakes(target_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare changed integer;
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then
    raise exception '当前账号无权恢复邮件';
  end if;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  select auth.uid(),'email_intake',e.id,'email_restored',
    jsonb_build_object('trashed_at',e.trashed_at,'trashed_by',e.trashed_by),
    jsonb_build_object('trashed_at',null,'triage_label',coalesce(e.pre_trash_triage_label,e.triage_label),'processing_status',coalesce(e.pre_trash_status,e.processing_status)),
    '人工批量从垃圾箱恢复邮件'
  from public.email_intake e where e.id=any(target_ids) and e.trashed_at is not null;

  update public.email_intake
  set triage_label=coalesce(pre_trash_triage_label,triage_label),
      processing_status=coalesce(pre_trash_status,processing_status),
      trashed_at=null,trashed_by=null,pre_trash_status=null,pre_trash_triage_label=null,
      updated_at=clock_timestamp()
  where id=any(target_ids) and trashed_at is not null;
  get diagnostics changed=row_count;
  return changed;
end;
$$;

create or replace function public.delete_trashed_email_intakes(target_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare changed integer;
begin
  if private.current_crm_role() <> 'owner' then
    raise exception '仅老板角色可彻底删除垃圾箱邮件';
  end if;
  if exists(select 1 from public.email_intake e where e.id=any(target_ids) and (e.trashed_at is null or e.inquiry_id is not null)) then
    raise exception '仅可彻底删除垃圾箱中且未关联询盘的邮件';
  end if;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  select auth.uid(),'email_intake',e.id,'email_permanently_deleted',
    jsonb_build_object('sender_email',e.sender_email,'subject',e.subject,'message_id',e.message_id,'received_at',e.received_at,'triage_label',e.triage_label,'trashed_at',e.trashed_at),
    jsonb_build_object('deleted_at',clock_timestamp()),'老板从垃圾箱彻底删除未关联询盘的邮件'
  from public.email_intake e where e.id=any(target_ids);

  delete from public.email_intake where id=any(target_ids) and trashed_at is not null and inquiry_id is null;
  get diagnostics changed=row_count;
  return changed;
end;
$$;

grant execute on function public.trash_email_intakes(uuid[]) to authenticated;
grant execute on function public.restore_email_intakes(uuid[]) to authenticated;
grant execute on function public.delete_trashed_email_intakes(uuid[]) to authenticated;
