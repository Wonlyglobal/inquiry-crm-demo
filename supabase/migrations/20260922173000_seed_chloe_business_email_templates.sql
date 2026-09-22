-- User-authorized starter templates for Chloe's personal CRM workspace.
-- Idempotent by the existing (owner_id, name) unique constraint.
do $$
declare
  target_owner uuid := 'c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
  inserted_count integer := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id=target_owner and lower(email)='chloelee@wonlyglobal.com' and active
  ) then
    raise exception 'Chloe production profile does not match the approved target';
  end if;

  insert into public.email_templates(owner_id,name,category,language,subject,body_text)
  values
    (target_owner,'01 · 新询盘确认','reply','英文','Re: {{original_subject}}',E'Dear {{customer_name}},\n\nThank you for contacting WONLY regarding {{product_or_project}}. We have received your inquiry and are reviewing the information provided.\n\nTo help us respond accurately, please share the project location, required quantity, specifications, applicable standards, and expected delivery date if available.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'02 · 补充项目资料','reply','英文','Additional details required for {{project_name}}',E'Dear {{customer_name}},\n\nThank you for the project information. To prepare the correct recommendation and quotation, could you please confirm:\n1. Product type and dimensions\n2. Quantity by model\n3. Required certification or local standard\n4. Hardware and finish requirements\n5. Delivery destination and target schedule\n\nWe will review the confirmed details before making any technical or commercial commitment.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'03 · 首次跟进未回复','follow_up','英文','Following up on {{project_name}}',E'Dear {{customer_name}},\n\nI am following up on my previous email regarding {{project_name}}. Please let me know whether the project is still active and if you need any additional information from us.\n\nIf the scope has changed, you may send the latest requirements and we will review them accordingly.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'04 · 发送报价','quotation','英文','Quotation for {{project_name}}',E'Dear {{customer_name}},\n\nPlease find our quotation for {{project_name}} attached. The offer is based on the specifications, quantities, delivery terms, and validity stated in the quotation.\n\nPlease review the document and let us know if any item needs clarification or revision. Any change in scope may affect price and lead time.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'05 · 报价后跟进','follow_up','英文','Follow-up on quotation for {{project_name}}',E'Dear {{customer_name}},\n\nI am following up to confirm that you received our quotation for {{project_name}}.\n\nCould you share your feedback on the technical scope, commercial terms, and project schedule? We will review any requested changes before issuing a revised offer.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'06 · 样品需求确认','sample','英文','Sample requirements for {{product_name}}',E'Dear {{customer_name}},\n\nWe can arrange a sample evaluation for {{product_name}}. Before confirming, please provide the model, finish, configuration, quantity, delivery address, consignee details, and any required test standard.\n\nWe will confirm sample availability, cost, and estimated dispatch date after checking these details.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'07 · 样品已发出','sample','英文','Sample shipment update – {{tracking_number}}',E'Dear {{customer_name}},\n\nYour sample has been dispatched.\n\nCarrier: {{carrier}}\nTracking number: {{tracking_number}}\nDispatch date: {{dispatch_date}}\n\nPlease inspect the package after delivery and share your evaluation results. Contact us promptly if there is any visible shipping damage.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'08 · 预约会议','other','英文','Meeting proposal for {{project_name}}',E'Dear {{customer_name}},\n\nTo discuss {{project_name}} efficiently, we suggest a short online meeting. Please share two or three suitable time slots with your time zone and the main topics you would like to cover.\n\nWe will confirm the meeting time and participants by email.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'09 · 认证资料回复','reply','英文','Certification documents for {{product_name}}',E'Dear {{customer_name}},\n\nThank you for your certification request for {{product_name}}. We will provide only the documents applicable to the confirmed model and market.\n\nPlease confirm the destination country, required standard, product configuration, and project stage so that we can verify the correct documents before sending them.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'10 · 交期进度更新','follow_up','英文','Production and delivery update for {{order_or_project}}',E'Dear {{customer_name}},\n\nHere is the latest update for {{order_or_project}}:\nCurrent status: {{current_status}}\nNext milestone: {{next_milestone}}\nEstimated date: {{estimated_date}}\n\nThe date above is the latest estimate and remains subject to the confirmed production and logistics conditions. We will notify you if a verified change occurs.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'11 · 订单信息确认','quotation','英文','Order confirmation required – {{order_or_project}}',E'Dear {{customer_name}},\n\nBefore we proceed with {{order_or_project}}, please confirm the final product specifications, quantities, prices, Incoterms, payment terms, consignee information, delivery address, and approved drawings or samples.\n\nProduction will follow the mutually confirmed order documents. Please highlight any discrepancy before approval.\n\nBest regards,\n{{sender_name}}'),
    (target_owner,'12 · 到货后回访','follow_up','英文','Delivery follow-up for {{order_or_project}}',E'Dear {{customer_name}},\n\nWe are following up on the delivery of {{order_or_project}}. Please confirm whether the goods arrived in good condition and whether the quantity and specification match the shipping documents.\n\nIf you identify any issue, please send photos, item details, quantities, and packaging information so that we can register and review it promptly.\n\nBest regards,\n{{sender_name}}')
  on conflict(owner_id,name) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
    values(target_owner,'profile',target_owner,'email_templates_seeded',jsonb_build_object('inserted_count',inserted_count,'template_set','business-common-v1'),'用户要求为本人创建常用业务邮件模板');
  end if;
end $$;

