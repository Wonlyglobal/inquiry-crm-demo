begin;
do $$
declare
  actor_id uuid;
  target_inquiry uuid;
  target_order uuid:=gen_random_uuid();
  deposit_payment uuid:=gen_random_uuid();
  blocked_message text;
begin
  select id into actor_id from public.profiles
  where active=true and role in ('owner','sales_manager')
  order by case when role='owner' then 0 else 1 end,id limit 1;
  select id into target_inquiry from public.inquiries order by created_at desc limit 1;
  if actor_id is null or target_inquiry is null then raise exception 'NO_PAYMENT_ORDER_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);

  insert into public.sales_orders(id,inquiry_id,order_no,currency,total_amount,status,created_by)
  values(target_order,target_inquiry,'ROLLBACK-TOTAL-'||substr(target_order::text,1,8),'USD',100,'draft',actor_id);

  begin
    insert into public.order_payments(order_id,payment_type,amount,currency,status,expected_at,created_by)
    values(target_order,'deposit',10,'EUR','pending',clock_timestamp(),actor_id);
    raise exception 'CURRENCY_MISMATCH_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='CURRENCY_MISMATCH_NOT_BLOCKED' or position('必须与订单币种' in blocked_message)=0 then raise; end if;
  end;

  insert into public.order_payments(id,order_id,payment_type,amount,currency,status,expected_at,created_by)
  values(deposit_payment,target_order,'deposit',30,'USD','pending',clock_timestamp(),actor_id);
  begin
    insert into public.order_payments(order_id,payment_type,amount,currency,status,expected_at,created_by)
    values(target_order,'balance',71,'USD','pending',clock_timestamp(),actor_id);
    raise exception 'OVERALLOCATION_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='OVERALLOCATION_NOT_BLOCKED' or position('不能超过订单总额' in blocked_message)=0 then raise; end if;
  end;

  update public.sales_orders set status='confirmed' where id=target_order;
  begin
    update public.sales_orders set status='deposit_received' where id=target_order;
    raise exception 'DEPOSIT_STATUS_WITHOUT_RECEIPT_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='DEPOSIT_STATUS_WITHOUT_RECEIPT_NOT_BLOCKED' or position('必须先确认定金到账' in blocked_message)=0 then raise; end if;
  end;

  perform public.update_order_payment_status(
    target_payment_id=>deposit_payment,next_status=>'received',status_at=>clock_timestamp(),
    status_reference=>'ROLLBACK-DEPOSIT',status_note=>'回滚测试定金到账'
  );
  update public.sales_orders set status='deposit_received' where id=target_order;
  if not exists(select 1 from public.sales_orders where id=target_order and status='deposit_received') then
    raise exception 'VALID_DEPOSIT_STATUS_REJECTED';
  end if;
end;
$$;
select 'PASS — currency, order total and deposit receipt alignment verified; all writes will be rolled back' as production_regression;
rollback;
