-- Production-safe proof that an unresolved after-sales case cannot be hidden
-- by completing its order. Every write is rolled back.
begin;

do $$
declare
  target_inquiry uuid;
  actor_id uuid;
  target_order uuid:=gen_random_uuid();
  blocked_message text;
begin
  select i.id,i.owner_id into target_inquiry,actor_id
  from public.inquiries i
  join public.profiles p on p.id=i.owner_id and p.active=true
  order by i.created_at desc
  limit 1;
  if target_inquiry is null then raise exception 'NO_OWNED_INQUIRY_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);

  insert into public.sales_orders(id,inquiry_id,order_no,currency,total_amount,status,created_by)
  values(target_order,target_inquiry,'ROLLBACK-AFTER-SALES-'||substr(target_order::text,1,8),'USD',1,'draft',actor_id);
  update public.sales_orders set status='confirmed' where id=target_order;
  update public.sales_orders set status='production' where id=target_order;
  update public.sales_orders set status='ready_to_ship' where id=target_order;
  update public.sales_orders set status='shipped' where id=target_order;
  update public.sales_orders set status='delivered',delivered_at=clock_timestamp() where id=target_order;
  update public.sales_orders set status='after_sales',after_sales_status='open' where id=target_order;

  begin
    update public.sales_orders set status='completed',after_sales_status='none' where id=target_order;
    raise exception 'UNRESOLVED_AFTER_SALES_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='UNRESOLVED_AFTER_SALES_NOT_BLOCKED'
      or position('必须标记为已解决' in blocked_message)=0 then raise;
    end if;
  end;

  update public.sales_orders set status='completed',after_sales_status='resolved' where id=target_order;
  if not exists(select 1 from public.sales_orders where id=target_order and status='completed' and after_sales_status='resolved') then
    raise exception 'RESOLVED_AFTER_SALES_DID_NOT_COMPLETE';
  end if;
end;
$$;

select 'PASS — unresolved after-sales completion blocked and resolved completion allowed; all writes will be rolled back' as production_regression;
rollback;
