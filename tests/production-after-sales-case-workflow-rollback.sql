begin;
do $$
declare
  actor_id uuid;
  target_inquiry uuid;
  target_order uuid:=gen_random_uuid();
  target_case uuid;
  saved_case public.after_sales_cases;
  blocked_message text;
  event_count integer;
begin
  select id into actor_id from public.profiles where active=true and role in ('owner','sales_manager')
  order by case when role='owner' then 0 else 1 end,id limit 1;
  select id into target_inquiry from public.inquiries order by created_at desc limit 1;
  if actor_id is null or target_inquiry is null then raise exception 'NO_AFTER_SALES_CASE_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set status='won',won_amount=100,won_currency='USD',won_exchange_rate=1,won_at=clock_timestamp() where id=target_inquiry;
  perform set_config('app.inquiry_workflow_rpc','off',true);
  insert into public.sales_orders(id,inquiry_id,order_no,currency,total_amount,created_by)
  values(target_order,target_inquiry,'ROLLBACK-CASE-'||left(target_order::text,8),'USD',100,actor_id);
  perform public.update_sales_order_progress(target_order,'confirmed',null,null,'none','status_change','回滚测试确认订单');
  perform public.update_sales_order_progress(target_order,'production',null,null,'none','production','回滚测试进入生产');
  perform public.update_sales_order_progress(target_order,'ready_to_ship',null,null,'none','delivery','回滚测试待发货');
  perform public.update_sales_order_progress(target_order,'shipped',null,null,'none','delivery','回滚测试已发货','DHL','ROLLBACK-CASE-TRACK',clock_timestamp());
  perform public.update_sales_order_progress(target_order,'delivered',null,clock_timestamp(),'none','delivery','回滚测试已交付','DHL','ROLLBACK-CASE-TRACK',clock_timestamp()-interval '1 hour');

  select id into target_case from public.create_after_sales_case(target_order,'quality','客户反馈外观瑕疵');
  begin
    perform public.update_sales_order_progress(target_order,'completed',null,clock_timestamp(),'resolved','after_sales','尝试跳过售后工单','DHL','ROLLBACK-CASE-TRACK',clock_timestamp()-interval '1 hour');
    raise exception 'UNRESOLVED_CASE_COMPLETION_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='UNRESOLVED_CASE_COMPLETION_NOT_BLOCKED' or position('仍有未解决售后工单' in blocked_message)=0 then raise; end if;
  end;
  perform public.update_after_sales_case(target_case,'processing',null,'已安排补发并等待客户确认');
  select * into saved_case from public.update_after_sales_case(target_case,'resolved','已补发合格产品，客户确认收货','客户确认问题解决');
  select * into saved_case from public.update_after_sales_case(target_case,'closed',saved_case.resolution,'售后工单正式结案');
  select count(*) into event_count from public.order_events where order_id=target_order;
  if saved_case.status<>'closed' or event_count<>9
     or not exists(select 1 from public.sales_orders where id=target_order and status='completed' and after_sales_status='resolved') then
    raise exception 'AFTER_SALES_CASE_WORKFLOW_INCOMPLETE';
  end if;
end;
$$;
select 'PASS — structured case opened, bypass blocked, processed, resolved and closed with nine events; all writes will be rolled back' as production_regression;
rollback;
