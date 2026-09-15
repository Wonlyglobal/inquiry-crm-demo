-- Make progressive qualification a server-enforced, auditable workflow.

alter table public.inquiries
  add column if not exists qualification_manager_confirmed_at timestamptz,
  add column if not exists qualification_manager_confirmed_by uuid references public.profiles(id);

create or replace function private.enforce_qualification_workflow()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(current_setting('app.qualification_workflow_rpc',true),'')<>'on' and (
    new.qualification_identity is distinct from old.qualification_identity
    or new.qualification_need is distinct from old.qualification_need
    or new.qualification_role is distinct from old.qualification_role
    or new.qualification_value is distinct from old.qualification_value
    or new.qualification_timing is distinct from old.qualification_timing
    or new.qualification_fit is distinct from old.qualification_fit
    or new.qualification_next_step is distinct from old.qualification_next_step
    or new.qualification_score is distinct from old.qualification_score
    or new.lead_priority is distinct from old.lead_priority
    or new.qualification_manager_confirmed_at is distinct from old.qualification_manager_confirmed_at
    or new.qualification_manager_confirmed_by is distinct from old.qualification_manager_confirmed_by
  ) then
    raise exception '资格核验字段必须通过分角色的服务端流程修改';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_qualification_workflow() from public,anon,authenticated;

drop trigger if exists inquiries_enforce_qualification_workflow on public.inquiries;
create trigger inquiries_enforce_qualification_workflow
before update of qualification_identity,qualification_need,qualification_role,qualification_value,
  qualification_timing,qualification_fit,qualification_next_step,qualification_score,lead_priority,
  qualification_manager_confirmed_at,qualification_manager_confirmed_by
on public.inquiries for each row execute function private.enforce_qualification_workflow();

create or replace function public.save_inquiry_qualification(
  target_inquiry_id uuid,
  identity_note text,
  need_note text,
  contact_role_note text,
  value_note text,
  timing_note text,
  fit_note text,
  next_step_note text,
  requested_priority text,
  change_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  item public.inquiries;
  actor_role public.crm_role:=private.current_crm_role();
  actor_id uuid:=auth.uid();
  next_identity text;
  next_need text;
  next_role text;
  next_value text;
  next_timing text;
  next_fit text;
  next_step text;
  next_priority text;
  next_score integer;
  confirmed_at timestamptz;
  confirmed_by uuid;
  occurred_at timestamptz:=clock_timestamp();
begin
  if actor_id is null or actor_role not in ('owner','sales_manager','marketing','sales') then
    raise exception '当前账号无权保存资格核验';
  end if;
  if nullif(btrim(change_reason),'') is null then raise exception '请填写资格核验修改原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if actor_role='sales' and item.owner_id is distinct from actor_id then
    raise exception '业务员只能维护本人负责询盘的销售资格信息';
  end if;

  next_identity:=item.qualification_identity;
  next_need:=item.qualification_need;
  next_role:=item.qualification_role;
  next_value:=item.qualification_value;
  next_timing:=item.qualification_timing;
  next_fit:=item.qualification_fit;
  next_step:=item.qualification_next_step;
  next_priority:=item.lead_priority;

  if actor_role in ('owner','sales_manager','marketing') then
    next_identity:=nullif(btrim(identity_note),'');
    next_need:=nullif(btrim(need_note),'');
    next_fit:=nullif(btrim(fit_note),'');
  end if;
  if actor_role in ('owner','sales_manager','sales') then
    next_role:=nullif(btrim(contact_role_note),'');
    next_value:=nullif(btrim(value_note),'');
    next_timing:=nullif(btrim(timing_note),'');
    next_step:=nullif(btrim(next_step_note),'');
  end if;
  if actor_role in ('owner','sales_manager') then
    if requested_priority not in ('P0','P1','P2','P3') then raise exception '主管必须选择有效优先级'; end if;
    next_priority:=requested_priority;
  end if;

  next_score:=round((
    (case when next_identity is not null then 1 else 0 end)+
    (case when next_need is not null then 1 else 0 end)+
    (case when next_role is not null then 1 else 0 end)+
    (case when next_value is not null then 1 else 0 end)+
    (case when next_timing is not null then 1 else 0 end)+
    (case when next_fit is not null then 1 else 0 end)+
    (case when next_step is not null then 1 else 0 end)
  )*100.0/7)::integer;

  if actor_role in ('owner','sales_manager') and next_score=100 then
    confirmed_at:=occurred_at;
    confirmed_by:=actor_id;
  else
    confirmed_at:=null;
    confirmed_by:=null;
  end if;

  perform set_config('app.qualification_workflow_rpc','on',true);
  update public.inquiries set
    qualification_identity=next_identity,qualification_need=next_need,
    qualification_role=next_role,qualification_value=next_value,
    qualification_timing=next_timing,qualification_fit=next_fit,
    qualification_next_step=next_step,qualification_score=next_score,
    lead_priority=next_priority,qualification_manager_confirmed_at=confirmed_at,
    qualification_manager_confirmed_by=confirmed_by,last_change_reason=btrim(change_reason),
    updated_by=actor_id,updated_at=occurred_at
  where id=target_inquiry_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor_id,'inquiry',target_inquiry_id,'qualification_updated',
    jsonb_build_object('score',item.qualification_score,'priority',item.lead_priority,
      'manager_confirmed_at',item.qualification_manager_confirmed_at),
    jsonb_build_object('score',next_score,'priority',next_priority,'role',actor_role,
      'manager_confirmed_at',confirmed_at,'manager_confirmed_by',confirmed_by),btrim(change_reason));

  return jsonb_build_object(
    'qualification_identity',next_identity,'qualification_need',next_need,
    'qualification_role',next_role,'qualification_value',next_value,
    'qualification_timing',next_timing,'qualification_fit',next_fit,
    'qualification_next_step',next_step,'qualification_score',next_score,
    'lead_priority',next_priority,'qualification_manager_confirmed_at',confirmed_at,
    'qualification_manager_confirmed_by',confirmed_by,'updated_at',occurred_at
  );
end;
$$;

revoke all on function public.save_inquiry_qualification(uuid,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.save_inquiry_qualification(uuid,text,text,text,text,text,text,text,text,text) to authenticated;
