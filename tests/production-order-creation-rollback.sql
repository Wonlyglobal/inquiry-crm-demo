begin;
do $$
declare
  actor_id uuid;
  target_inquiry uuid;
  first_order uuid:=gen_random_uuid();
  blocked_message text;
begin
  select id into actor_id from public.profiles where active=true and role in ('owner','sales_manager')
  order by case when role='owner' then 0 else 1 end,id limit 1;
  select id into target_inquiry from public.inquiries order by created_at desc limit 1;
  if actor_id is null or target_inquiry is null then raise exception 'NO_ORDER_ELIGIBILITY_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set status='received' where id=target_inquiry;
  perform set_config('app.inquiry_workflow_rpc','off',true);

  begin
    insert into public.sales_orders(inquiry_id,order_no,currency,total_amount,created_by)
    values(target_inquiry,'ROLLBACK-NON-WON','USD',10,actor_id);
    raise exception 'NON_WON_ORDER_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='NON_WON_ORDER_NOT_BLOCKED' or position('主管审批后建立' in blocked_message)=0 then raise; end if;
  end;

  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set status='won',won_amount=100,won_currency='USD',won_exchange_rate=1,won_at=clock_timestamp() where id=target_inquiry;
  perform set_config('app.inquiry_workflow_rpc','off',true);
  select id into first_order from public.create_sales_order(
    target_inquiry,'ROLLBACK-VALID-'||left(first_order::text,8),60,'USD',clock_timestamp()+interval '30 days','rollback-only atomic order'
  );
  if (select count(*) from public.order_events where order_id=first_order and event_type='status_change' and status='draft')<>1 then
    raise exception 'ORDER_OPENING_EVENT_NOT_ATOMIC';
  end if;

  begin
    insert into public.sales_orders(inquiry_id,order_no,currency,total_amount,created_by)
    values(target_inquiry,'ROLLBACK-CURRENCY','EUR',10,actor_id);
    raise exception 'ORDER_CURRENCY_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='ORDER_CURRENCY_NOT_BLOCKED' or position('必须与审批成交币种' in blocked_message)=0 then raise; end if;
  end;
  begin
    insert into public.sales_orders(inquiry_id,order_no,currency,total_amount,created_by)
    values(target_inquiry,'ROLLBACK-OVER-TOTAL','USD',50,actor_id);
    raise exception 'ORDER_TOTAL_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='ORDER_TOTAL_NOT_BLOCKED' or position('不能超过审批成交额' in blocked_message)=0 then raise; end if;
  end;
end;
$$;
rollback;

select concat(
  'function=',to_regprocedure('public.create_sales_order(uuid,text,numeric,text,timestamptz,text)') is not null,
  '; anon_execute=',has_function_privilege('anon','public.create_sales_order(uuid,text,numeric,text,timestamptz,text)','execute'),
  '; authenticated_execute=',has_function_privilege('authenticated','public.create_sales_order(uuid,text,numeric,text,timestamptz,text)','execute'),
  '; authenticated_insert=',has_table_privilege('authenticated','public.sales_orders','insert'),
  '; rollback_orders=',(select count(*) from public.sales_orders where notes='rollback-only atomic order'),
  '; rollback_events=',(select count(*) from public.order_events where detail like '创建销售订单：ROLLBACK-VALID-%')
) as production_atomic_order_creation;
