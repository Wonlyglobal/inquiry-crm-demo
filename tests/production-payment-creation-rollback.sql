begin;
do $$
declare
  actor_id uuid;
  target_inquiry uuid;
  target_order uuid:=gen_random_uuid();
  target_payment uuid:=gen_random_uuid();
  saved public.order_payments;
  blocked_message text;
begin
  select id into actor_id from public.profiles
  where active=true and role in ('owner','sales_manager')
  order by case when role='owner' then 0 else 1 end,id limit 1;
  select id into target_inquiry from public.inquiries order by created_at desc limit 1;
  if actor_id is null or target_inquiry is null then raise exception 'NO_PAYMENT_CREATION_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set status='won',won_amount=1000000,won_currency='USD',won_exchange_rate=1,won_at=clock_timestamp() where id=target_inquiry;
  perform set_config('app.inquiry_workflow_rpc','off',true);

  insert into public.sales_orders(id,inquiry_id,order_no,currency,total_amount,created_by)
  values(target_order,target_inquiry,'ROLLBACK-'||left(target_order::text,8),'USD',100,actor_id);

  begin
    insert into public.order_payments(order_id,payment_type,amount,currency,status,received_at,reference_no,created_by)
    values(target_order,'deposit',30,'USD','received',clock_timestamp(),'DIRECT-BYPASS',actor_id);
    raise exception 'DIRECT_RECEIVED_INSERT_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='DIRECT_RECEIVED_INSERT_NOT_BLOCKED' or position('只能先登记为待回款' in blocked_message)=0 then raise; end if;
  end;

  insert into public.order_payments(id,order_id,payment_type,amount,currency,status,expected_at,created_by)
  values(target_payment,target_order,'deposit',30,'USD','pending',clock_timestamp()+interval '7 days',actor_id);
  select * into saved from public.update_order_payment_status(
    target_payment,'received',clock_timestamp(),'ROLLBACK-RECEIPT','回滚测试确认到账'
  );
  if saved.status<>'received' or saved.reference_no<>'ROLLBACK-RECEIPT' or saved.received_note<>'回滚测试确认到账' then
    raise exception 'AUDITED_RECEIPT_INCOMPLETE';
  end if;
end;
$$;
select 'PASS — direct received insert blocked and audited receipt transition verified; all writes will be rolled back' as production_regression;
rollback;
