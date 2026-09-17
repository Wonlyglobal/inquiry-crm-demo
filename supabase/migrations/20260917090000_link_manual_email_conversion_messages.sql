-- A manually converted shared-mailbox intake and its synchronized message are
-- two copies of the same email. Keep them in the same inquiry transaction so
-- reply threading, follow-up evidence and communication summaries can see it.
create or replace function private.link_email_intake_messages(
  target_intake_id uuid,
  target_inquiry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  intake public.email_intake;
  canonical_message public.email_messages;
  linked_count integer:=0;
begin
  select e.* into intake
  from public.email_intake e
  where e.id=target_intake_id;

  if not found or target_inquiry_id is null or nullif(btrim(intake.message_id),'') is null then
    return jsonb_build_object('linked_count',0,'canonical_message_id',null);
  end if;

  -- Never steal a message that is already attached to another inquiry. Exact
  -- Message-ID matching is deliberately required; subject/address similarity
  -- is not strong enough evidence for a production relationship.
  update public.email_messages em
  set inquiry_id=target_inquiry_id,
      association_status='matched',
      association_method='manual_intake_conversion'
  where nullif(btrim(em.message_id),'')=btrim(intake.message_id)
    and (em.inquiry_id is null or em.inquiry_id=target_inquiry_id);
  get diagnostics linked_count=row_count;

  -- An internal test may exist once in Sent and once in the shared Inbox. Link
  -- both copies for threading, but derive CRM evidence from the inbound copy.
  select em.* into canonical_message
  from public.email_messages em
  left join public.mailbox_connections mc on mc.id=em.mailbox_connection_id
  where nullif(btrim(em.message_id),'')=btrim(intake.message_id)
    and em.inquiry_id=target_inquiry_id
    and em.association_status='matched'
  order by
    case when em.direction='inbound' then 0 else 1 end,
    case when mc.mailbox_kind='shared_inquiry' then 0 else 1 end,
    coalesce(em.received_at,em.sent_at,em.created_at),em.id
  limit 1;

  if canonical_message.id is not null then
    perform public.record_synced_email_followup(canonical_message.id);

    if not exists(
      select 1 from public.communication_summaries cs
      where cs.inquiry_id=target_inquiry_id
        and cs.source_message_id=canonical_message.id
    ) then
      insert into public.communication_summaries(
        inquiry_id,source_message_id,summary_zh,latest_customer_request,
        confirmed_items,pending_items,objections,commitments,risks,
        recommended_next_step,provider,summary_scope,message_count,
        generation_trigger
      ) values(
        target_inquiry_id,canonical_message.id,
        case when canonical_message.direction='inbound'
          then '已将客户来信关联到询盘，待业务员确认需求并回复。'
          else '已将业务员发信关联到询盘，待客户回复。' end,
        case when canonical_message.direction='inbound'
          then coalesce(nullif(btrim(canonical_message.body_text),''),nullif(btrim(canonical_message.subject),''),'待确认客户需求')
          else '等待客户回复' end,
        '邮件与询盘的关联已确认','具体需求、交期及商务条件待业务员核实',
        '暂无明确证据','暂无明确证据','尚未完成人工复核',
        case when canonical_message.direction='inbound'
          then '阅读客户原始邮件，确认需求后在同一邮件线程回复。'
          else '关注客户回复并在原线程继续跟进。' end,
        'rules','message',1,'mail_sync'
      );
    end if;
  end if;

  insert into public.audit_logs(
    actor_id,entity_type,entity_id,action,after_data,reason
  ) values(
    auth.uid(),'email_intake',target_intake_id,'link_converted_email_messages',
    jsonb_build_object(
      'inquiry_id',target_inquiry_id,
      'message_id',intake.message_id,
      'linked_count',linked_count,
      'canonical_message_id',canonical_message.id
    ),
    '邮件转询盘后按 Message-ID 关联同步邮件、沟通证据和初始摘要'
  );

  return jsonb_build_object(
    'linked_count',linked_count,
    'canonical_message_id',canonical_message.id
  );
end;
$$;

revoke all on function private.link_email_intake_messages(uuid,uuid) from public,anon,authenticated;

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
      insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
      values(
        actor_id,'email_intake',intake.id,'convert_email_to_inquiry',
        jsonb_build_object('inquiry_id',intake.inquiry_id,'processing_status',intake.processing_status,'triage_label',intake.triage_label),
        jsonb_build_object('inquiry_id',intake.inquiry_id,'processing_status',case when intake.processing_status='pending_review' then 'converted' else intake.processing_status end,'triage_label','real'),
        '人工确认已有询盘关联邮件为真实邮件；未重复创建询盘'
      );
      update public.email_intake
      set triage_label='real',triaged_by=actor_id,triaged_at=coalesce(triaged_at,clock_timestamp()),
          processing_status=case when processing_status='pending_review' then 'converted' else processing_status end,
          updated_at=clock_timestamp()
      where id=intake.id;
      perform private.link_email_intake_messages(intake.id,intake.inquiry_id);
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

    perform private.link_email_intake_messages(intake.id,new_inquiry_id);

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

-- Repair already-converted intakes, including the acceptance-test inquiry,
-- without changing the inquiry itself or overwriting conflicting links.
do $$
declare
  intake_row record;
begin
  for intake_row in
    select e.id,e.inquiry_id
    from public.email_intake e
    where e.inquiry_id is not null
      and nullif(btrim(e.message_id),'') is not null
    order by e.created_at,e.id
  loop
    perform private.link_email_intake_messages(intake_row.id,intake_row.inquiry_id);
  end loop;
end;
$$;
