begin;
do $$
declare
  actor_id uuid;
  target_inquiry uuid;
  target_order uuid:=gen_random_uuid();
  saved public.sales_orders;
  blocked_message text;
begin
  select id into actor_id from public.profiles
  where active=true and role in ('owner','sales_manager')
  order by case when role='owner' then 0 else 1 end,id limit 1;
  select id into target_inquiry from public.inquiries order by created_at desc limit 1;
  if actor_id is null or target_inquiry is null then raise exception 'NO_ORDER_DELIVERY_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set status='won',won_amount=1000000,won_currency='USD',won_exchange_rate=1,won_at=clock_timestamp() where id=target_inquiry;
  perform set_config('app.inquiry_workflow_rpc','off',true);

  insert into public.sales_orders(id,inquiry_id,order_no,currency,total_amount,status,created_by)
  values(target_order,target_inquiry,'ROLLBACK-DELIVERY-'||substr(target_order::text,1,8),'USD',100,'draft',actor_id);
  perform public.update_sales_order_progress(target_order,'confirmed',null,null,'none','status_change','回滚测试确认订单');
  perform public.update_sales_order_progress(target_order,'production',null,null,'none','production','回滚测试进入生产');
  perform public.update_sales_order_progress(target_order,'ready_to_ship',null,null,'none','delivery','回滚测试待发货');

  begin
    perform public.update_sales_order_progress(target_order,'shipped',null,null,'none','delivery','回滚测试无凭证发货');
    raise exception 'SHIPPING_EVIDENCE_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='SHIPPING_EVIDENCE_NOT_BLOCKED' or position('必须保留承运商' in blocked_message)=0 then raise; end if;
  end;

  select * into saved from public.update_sales_order_progress(
    target_order,'shipped',null,null,'none','delivery','回滚测试已发货',
    'DHL','ROLLBACK-TRACKING',clock_timestamp()
  );
  if saved.status<>'shipped' or saved.shipping_tracking_no<>'ROLLBACK-TRACKING' then raise exception 'VALID_SHIPMENT_REJECTED'; end if;

  begin
    perform public.update_sales_order_progress(
      target_order,'delivered',null,null,'none','delivery','回滚测试无签收时间',
      saved.shipping_carrier,saved.shipping_tracking_no,saved.shipped_at
    );
    raise exception 'DELIVERY_TIME_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='DELIVERY_TIME_NOT_BLOCKED' or position('必须保留实际交付时间' in blocked_message)=0 then raise; end if;
  end;

  select * into saved from public.update_sales_order_progress(
    target_order,'delivered',null,clock_timestamp(),'none','delivery','回滚测试已签收',
    saved.shipping_carrier,saved.shipping_tracking_no,saved.shipped_at
  );
  if saved.status<>'delivered' or saved.delivered_at is null then raise exception 'VALID_DELIVERY_REJECTED'; end if;
end;
$$;
select 'PASS — shipping evidence and signed delivery verified; all writes will be rolled back' as production_regression;
rollback;
