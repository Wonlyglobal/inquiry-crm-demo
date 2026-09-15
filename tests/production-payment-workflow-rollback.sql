-- Production-safe proof of receipt, immutability and refund evidence.
-- Every write is rolled back.
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
  if actor_id is null or target_inquiry is null then raise exception 'NO_PAYMENT_WORKFLOW_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);

  insert into public.sales_orders(id,inquiry_id,order_no,currency,total_amount,status,created_by)
  values(target_order,target_inquiry,'ROLLBACK-PAYMENT-'||substr(target_order::text,1,8),'USD',100,'draft',actor_id);
  insert into public.order_payments(id,order_id,payment_type,amount,currency,status,expected_at,created_by)
  values(target_payment,target_order,'deposit',30,'USD','pending',clock_timestamp(),actor_id);

  select * into saved from public.update_order_payment_status(
    target_payment_id=>target_payment,next_status=>'received',status_at=>clock_timestamp(),
    status_reference=>'ROLLBACK-RECEIPT',status_note=>'回滚测试到账'
  );
  if saved.status<>'received' or saved.reference_no<>'ROLLBACK-RECEIPT' then
    raise exception 'PAYMENT_RECEIPT_DID_NOT_PERSIST';
  end if;

  begin
    update public.order_payments set amount=31 where id=target_payment;
    raise exception 'PAYMENT_EVIDENCE_MUTATION_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='PAYMENT_EVIDENCE_MUTATION_NOT_BLOCKED'
      or position('不可改写' in blocked_message)=0 then raise;
    end if;
  end;

  select * into saved from public.update_order_payment_status(
    target_payment_id=>target_payment,next_status=>'refunded',status_at=>clock_timestamp(),
    status_reference=>'ROLLBACK-REFUND',status_note=>'回滚测试退款原因'
  );
  if saved.status<>'refunded' or saved.refunded_at is null
    or saved.refund_reference_no<>'ROLLBACK-REFUND' or saved.refund_reason<>'回滚测试退款原因' then
    raise exception 'PAYMENT_REFUND_EVIDENCE_INCOMPLETE';
  end if;
end;
$$;

select 'PASS — receipt, immutable evidence and manager refund verified; all writes will be rolled back' as production_regression;
rollback;
