alter table public.email_intake add column if not exists triage_label text check (triage_label in ('real','warmup'));
alter table public.email_intake add column if not exists triaged_by uuid references public.profiles(id);
alter table public.email_intake add column if not exists triaged_at timestamptz;

create or replace function public.triage_email_intakes(target_ids uuid[], target_label text)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then raise exception '当前账号无权标记邮件'; end if;
  if target_label not in ('real','warmup') then raise exception '邮件标记无效'; end if;
  update public.email_intake set triage_label=target_label,triaged_by=auth.uid(),triaged_at=clock_timestamp(),updated_at=clock_timestamp(),
    processing_status=case when target_label='warmup' then 'rejected' when processing_status='rejected' then 'pending_review' else processing_status end
  where id=any(target_ids);
  get diagnostics changed=row_count;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data)
  select auth.uid(),'email_intake',e.id,'email_triage','人工批量标记邮件',jsonb_build_object('triage_label',target_label)
  from public.email_intake e where e.id=any(target_ids);
  return changed;
end; $$;
grant execute on function public.triage_email_intakes(uuid[],text) to authenticated;
