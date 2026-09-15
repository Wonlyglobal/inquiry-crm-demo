begin;
do $$
declare
  actor_id uuid;
  target_inquiry uuid;
  target_order uuid:=gen_random_uuid();
begin
  select id into actor_id from public.profiles where active=true and role in ('owner','sales_manager')
  order by case when role='owner' then 0 else 1 end,id limit 1;
  select id into target_inquiry from public.inquiries order by created_at desc limit 1;
  if actor_id is null or target_inquiry is null then raise exception 'NO_ORDER_EVENT_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set status='won',won_amount=100,won_currency='USD',won_exchange_rate=1,won_at=clock_timestamp() where id=target_inquiry;
  perform set_config('app.inquiry_workflow_rpc','off',true);
  insert into public.sales_orders(id,inquiry_id,order_no,currency,total_amount,created_by)
  values(target_order,target_inquiry,'ROLLBACK-EVENT-'||left(target_order::text,8),'USD',100,actor_id);
  perform set_config('test.order_id',target_order::text,true);
  perform set_config('test.actor_id',actor_id::text,true);
end;
$$;

set local role authenticated;
do $$
declare
  target_order uuid:=current_setting('test.order_id')::uuid;
  actor_id uuid:=current_setting('test.actor_id')::uuid;
  blocked_message text;
begin
  perform public.update_sales_order_progress(target_order,'confirmed',null,null,'none','status_change','回滚测试确认订单');
  begin
    insert into public.order_events(order_id,event_type,status,detail,created_by)
    values(target_order,'note','confirmed','伪造浏览器进展',actor_id);
    raise exception 'DIRECT_ORDER_EVENT_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='DIRECT_ORDER_EVENT_NOT_BLOCKED' or position('permission denied' in lower(blocked_message))=0 then raise; end if;
  end;
end;
$$;
reset role;

do $$
declare
  event_count integer;
begin
  select count(*) into event_count from public.order_events where order_id=current_setting('test.order_id')::uuid;
  if event_count<>1 then raise exception 'ORDER_EVENT_TIMELINE_INCOMPLETE'; end if;
end;
$$;
select 'PASS — atomic order event persisted and direct browser event insert was denied; all writes will be rolled back' as production_regression;
rollback;
