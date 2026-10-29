-- Explicit salesperson declaration of completed first contact; existing record optional.
-- No historical batch update, task deletion, or inferred contact timestamp.
create or replace function public.confirm_assignment_first_contact(
  target_inquiry_id uuid,
  evidence_follow_up_id uuid,
  actual_contact_at timestamptz,
  confirmation_note text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item public.inquiries%rowtype;
  evidence public.follow_ups%rowtype;
  confirmed_at timestamptz:=clock_timestamp();
begin
  if actor is null or not exists(select 1 from public.profiles p where p.id=actor and p.active=true and p.role='sales')
    or coalesce(auth.jwt()->'app_metadata'->>'crm_read_only','false')='true' then
    raise exception '仅负责业务员可确认本人任务';
  end if;
  if nullif(trim(confirmation_note),'') is null or length(confirmation_note)>1000 then
    raise exception '请填写核对说明（最多1000字）';
  end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found or item.owner_id is distinct from actor then raise exception '只能处理本人负责的任务'; end if;
  if item.validity<>'valid' or item.excluded_from_dashboard or item.status in ('won','lost')
    or item.invalid_review_status='pending' or item.assigned_at is null then
    raise exception '当前询盘不能确认首次联系';
  end if;
  if evidence_follow_up_id is not null then
    select * into evidence from public.follow_ups where id=evidence_follow_up_id for update;
    if not found or evidence.inquiry_id is distinct from item.id or evidence.author_id is distinct from actor
      or evidence.method not in ('phone','meeting','email','whatsapp') or nullif(trim(evidence.content),'') is null then
      raise exception '只能关联本人已保存的真实联系记录';
    end if;
  end if;
  if actual_contact_at is null or actual_contact_at<item.assigned_at or actual_contact_at>confirmed_at then
    raise exception '实际联系时间须在本次分配后且不晚于当前时间';
  end if;
  if item.first_valid_contact_at is not null then
    if item.first_valid_contact_at=actual_contact_at and (evidence_follow_up_id is null or evidence.is_first_valid_contact) then
      return jsonb_build_object('confirmed',true,'already_confirmed',true,'first_valid_contact_at',item.first_valid_contact_at);
    end if;
    raise exception '已确认首次联系，请刷新查看；不能覆盖原时间';
  end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set first_valid_contact_at=actual_contact_at,updated_by=actor,
    updated_at=confirmed_at,last_change_reason='业务员主动标记已联系并完成分配待办'
    where id=item.id;
  if evidence_follow_up_id is not null then
    update public.follow_ups set is_first_valid_contact=true where id=evidence.id;
  end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
    values(actor,'inquiry',item.id,'assignment_contact_confirmed',
      jsonb_build_object('first_valid_contact_at',item.first_valid_contact_at),
      jsonb_build_object('first_valid_contact_at',actual_contact_at,'confirmed_at',confirmed_at,
        'evidence_follow_up_id',evidence.id,'evidence_recorded_at',evidence.created_at,'confirmation_basis','salesperson_declaration'),trim(confirmation_note));
  return jsonb_build_object('confirmed',true,'already_confirmed',false,'first_valid_contact_at',actual_contact_at);
end;
$$;
revoke all on function public.confirm_assignment_first_contact(uuid,uuid,timestamptz,text) from public,anon,service_role;
grant execute on function public.confirm_assignment_first_contact(uuid,uuid,timestamptz,text) to authenticated;
