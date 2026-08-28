-- Tighten role-based administration, public-pool eligibility and first-contact evidence.

alter table public.follow_ups
  add column if not exists is_first_valid_contact boolean not null default false;

create unique index if not exists follow_ups_one_first_valid_contact_idx
  on public.follow_ups (inquiry_id)
  where is_first_valid_contact;

create or replace function public.record_inquiry_followup(
  target_inquiry_id uuid,
  follow_method text,
  follow_content text,
  customer_response text default null,
  next_follow_at timestamptz default null,
  mark_first_valid_contact boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.crm_role := private.current_crm_role();
  item public.inquiries;
  followup_id uuid;
  occurred_at timestamptz := clock_timestamp();
begin
  if actor_role not in ('owner','sales_manager','sales') then
    raise exception '当前角色不能新增销售跟进';
  end if;
  if follow_method not in ('email','whatsapp','phone','meeting','other') then
    raise exception '请选择有效的跟进方式';
  end if;
  if nullif(trim(follow_content),'') is null then raise exception '请填写跟进内容'; end if;

  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.validity <> 'valid' or item.invalid_review_status='pending' then
    raise exception '只有已确认有效且无待审无效申请的询盘才能跟进';
  end if;
  if actor_role='sales' and item.owner_id is distinct from auth.uid() then
    raise exception '只能跟进本人负责的询盘';
  end if;
  if item.status not in ('won','lost') and next_follow_at is null then
    raise exception '进行中商机必须设置下次跟进时间';
  end if;
  if mark_first_valid_contact then
    if item.owner_id is null or item.assigned_at is null then raise exception '询盘完成分配后才能记录首次有效联系'; end if;
    if item.first_valid_contact_at is not null then raise exception '该询盘已经记录首次有效联系'; end if;
  end if;

  insert into public.follow_ups(inquiry_id,author_id,method,content,customer_feedback,next_follow_up_at,is_first_valid_contact)
  values(target_inquiry_id,auth.uid(),follow_method,trim(follow_content),nullif(trim(customer_response),''),next_follow_at,mark_first_valid_contact)
  returning id into followup_id;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set
    first_valid_contact_at=case when mark_first_valid_contact then occurred_at else first_valid_contact_at end,
    next_follow_up_at=coalesce(next_follow_at,next_follow_up_at),
    updated_by=auth.uid(),
    last_change_reason=case when mark_first_valid_contact then '新增可核验跟进并确认首次有效联系' else '新增跟进记录' end,
    updated_at=occurred_at
  where id=target_inquiry_id;

  return followup_id;
end;
$$;

revoke all on function public.record_inquiry_followup(uuid,text,text,text,timestamptz,boolean) from public;
grant execute on function public.record_inquiry_followup(uuid,text,text,text,timestamptz,boolean) to authenticated;

-- Resolve the active sales manager by role instead of a hard-coded email address.
create or replace function public.request_original_email_forward(target_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  intake_id uuid;
  manager_email text;
begin
  if private.current_crm_role() not in ('owner','marketing') then raise exception '仅市场部或老板可转发原邮件'; end if;
  select id into intake_id from public.email_intake where inquiry_id=target_inquiry_id;
  if intake_id is null then raise exception '该询盘没有关联原始邮件'; end if;
  select email into manager_email from public.profiles
    where role='sales_manager' and active order by created_at asc limit 1;
  if manager_email is null then raise exception '当前没有启用中的销售主管账号'; end if;
  if exists(select 1 from public.integration_events where email_intake_id=intake_id and event_type='forward_original_email' and delivery_status='pending') then
    raise exception '原邮件已在转发队列中';
  end if;
  insert into public.integration_events(inquiry_id,email_intake_id,event_type,payload)
  values(target_inquiry_id,intake_id,'forward_original_email',jsonb_build_object('to',manager_email));
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'forward_requested','请求将原邮件转发给销售主管',jsonb_build_object('manager_email',manager_email));
end;
$$;

revoke all on function public.request_original_email_forward(uuid) from public;
grant execute on function public.request_original_email_forward(uuid) to authenticated;
