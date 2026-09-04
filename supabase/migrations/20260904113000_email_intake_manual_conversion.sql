create or replace function public.convert_email_intakes_to_inquiries(target_ids uuid[])
returns table(result_intake_id uuid, result_inquiry_id uuid, was_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  intake public.email_intake;
  company_id uuid;
  contact_id uuid;
  new_inquiry_id uuid;
  actor_id uuid := auth.uid();
  received_time timestamptz;
begin
  if private.current_crm_role() not in ('owner','marketing') then
    raise exception '仅市场部或老板可将邮件转为询盘';
  end if;

  for intake in
    select e.* from public.email_intake e
    where e.id = any(target_ids)
    order by coalesce(e.received_at,e.created_at),e.id
    for update
  loop
    if intake.triage_label = 'warmup' or intake.processing_status = 'rejected' then
      raise exception '邮件 % 已标记为养号或排除，不能转为询盘', intake.id;
    end if;

    if intake.inquiry_id is not null then
      update public.email_intake
      set triage_label='real',triaged_by=actor_id,triaged_at=coalesce(triaged_at,clock_timestamp()),
          processing_status=case when processing_status='pending_review' then 'converted' else processing_status end,
          updated_at=clock_timestamp()
      where id=intake.id;
      result_intake_id:=intake.id;
      result_inquiry_id:=intake.inquiry_id;
      was_created:=false;
      return next;
      continue;
    end if;

    company_id:=null;
    contact_id:=null;
    new_inquiry_id:=null;
    received_time:=coalesce(intake.received_at,intake.created_at,clock_timestamp());

    select c.id,c.company_id into contact_id,company_id
    from public.contacts c
    where lower(c.email)=lower(intake.sender_email)
    limit 1;

    if company_id is null then
      insert into public.companies(name,domain,created_by)
      values(coalesce(nullif(trim(intake.sender_name),''),'待核实邮件客户'),null,actor_id)
      returning id into company_id;
    end if;

    if contact_id is null then
      insert into public.contacts(company_id,full_name,email,created_by)
      values(company_id,nullif(trim(intake.sender_name),''),intake.sender_email,actor_id)
      returning id into contact_id;
    end if;

    insert into public.inquiries(
      company_id,contact_id,title,source,original_message,status,validity,
      created_by,updated_by,created_at,first_contact_due_at,last_change_reason
    ) values (
      company_id,contact_id,coalesce(nullif(trim(intake.subject),''),'来自客户邮件的询盘'),
      'email',intake.body_text,'pending_assignment','pending',actor_id,actor_id,received_time,
      received_time + interval '10 minutes','人工确认真实邮件并转为询盘商机'
    ) returning id into new_inquiry_id;

    update public.email_intake
    set inquiry_id=new_inquiry_id,triage_label='real',triaged_by=actor_id,
        triaged_at=clock_timestamp(),processing_status='converted',updated_at=clock_timestamp()
    where id=intake.id;

    insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
    values(
      actor_id,'email_intake',intake.id,'convert_email_to_inquiry',
      jsonb_build_object('inquiry_id',null,'processing_status',intake.processing_status,'triage_label',intake.triage_label),
      jsonb_build_object('inquiry_id',new_inquiry_id,'processing_status','converted','triage_label','real'),
      '市场部人工确认真实邮件并一键转为询盘商机'
    );

    result_intake_id:=intake.id;
    result_inquiry_id:=new_inquiry_id;
    was_created:=true;
    return next;
  end loop;
end;
$$;

grant execute on function public.convert_email_intakes_to_inquiries(uuid[]) to authenticated;
