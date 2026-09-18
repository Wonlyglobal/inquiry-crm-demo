begin;

do $$
declare
  target record;
  draft_id uuid;
begin
  select m.id as message_id,m.inquiry_id,p.id as author_id into target
  from public.email_messages m
  join public.inquiries i on i.id=m.inquiry_id
  join public.profiles p on p.active=true and p.role in ('owner','sales_manager')
  where m.direction='inbound'
  order by m.created_at desc,p.role desc
  limit 1;
  if target.message_id is null then raise exception '缺少可用于首次响应回滚验收的关联来信'; end if;

  perform set_config('request.jwt.claim.role','service_role',true);
  draft_id:=public.record_email_ai_draft(
    target.author_id,target.inquiry_id,target.message_id,'reply','English',
    'Rollback acceptance only','Thank you. Could you confirm the required quantity?',
    '仅验证首次响应建议持久化','生产回滚验收',
    jsonb_build_object('mode','minimum_first_response','recommended_send_at',clock_timestamp(),
      'customer_local_window','09:00–11:00','acknowledged_items',jsonb_build_array('客户已发送询盘'),
      'clarifying_questions',jsonb_build_array('请确认数量'),'do_not_promise',jsonb_build_array('价格与交期'))
  );
  if not exists(
    select 1 from public.email_ai_drafts d
    where d.id=draft_id and d.response_plan->>'mode'='minimum_first_response'
      and jsonb_array_length(d.response_plan->'do_not_promise')=1
  ) then raise exception 'FIRST_RESPONSE_PLAN_NOT_SAVED'; end if;
end;
$$;

rollback;
