-- Serialize public-pool approvals so one customer cannot be awarded twice.
create or replace function public.review_public_pool_action(target_request_id uuid,approve boolean,review_note text)
returns void language plpgsql security definer set search_path='' as $$
declare
  req public.inquiry_public_pool_requests;
  item public.inquiries;
  other_request record;
  request_inquiry_id uuid;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核公海申请'; end if;
  if nullif(trim(review_note),'') is null then raise exception '请填写审核依据'; end if;

  select inquiry_id into request_inquiry_id from public.inquiry_public_pool_requests where id=target_request_id;
  if not found then raise exception '当前没有待审核的公海申请'; end if;
  -- Every review for the same customer acquires locks in this order to avoid
  -- double assignment and deadlocks between competing requests.
  select * into item from public.inquiries where id=request_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  select * into req from public.inquiry_public_pool_requests where id=target_request_id for update;
  if not found or req.status<>'pending' then raise exception '当前没有待审核的公海申请'; end if;

  if approve and req.request_type='claim' then
    if item.owner_id is not null or item.public_pool_entered_at is null then raise exception '该客户已被领取，当前申请不能再批准'; end if;
    perform public.assign_inquiry_to_sales(req.inquiry_id,req.requested_by,'批准公海领取：'||trim(review_note));
  elsif approve and req.request_type='release' then
    if item.owner_id is distinct from req.requested_by or item.public_pool_entered_at is not null then raise exception '客户负责人已变化，当前释放申请不能再批准'; end if;
    perform public.release_inquiry_to_public_pool(req.inquiry_id,'批准业务员释放申请：'||trim(review_note));
  end if;

  update public.inquiry_public_pool_requests set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),review_reason=trim(review_note),reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=target_request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'public_pool_request_approved' else 'public_pool_request_rejected' end,jsonb_build_object('request_id',req.id,'request_type',req.request_type,'requested_by',req.requested_by),trim(review_note));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'public_pool_request_approved' else 'public_pool_request_rejected' end,case when approve then '公海申请已通过' else '公海申请被驳回' end,trim(review_note));

  if approve and req.request_type='claim' then
    for other_request in
      update public.inquiry_public_pool_requests
      set status='cancelled',reviewed_by=auth.uid(),review_reason='该客户已由其他申请人领取',reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
      where inquiry_id=req.inquiry_id and request_type='claim' and status='pending' and id<>req.id
      returning id,requested_by
    loop
      insert into public.notifications(recipient_id,inquiry_id,type,title,body)
      values(other_request.requested_by,req.inquiry_id,'public_pool_request_cancelled','公海领取申请已关闭','该客户已由其他申请人领取');
      insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
      values(auth.uid(),'inquiry',req.inquiry_id,'public_pool_request_cancelled',jsonb_build_object('request_id',other_request.id,'requested_by',other_request.requested_by),'该客户已由其他申请人领取');
    end loop;
  end if;
end $$;

revoke all on function public.review_public_pool_action(uuid,boolean,text) from public,anon;
grant execute on function public.review_public_pool_action(uuid,boolean,text) to authenticated;
