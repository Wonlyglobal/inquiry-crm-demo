-- Prevent impossible fulfillment histories even when records are changed outside the UI.
create or replace function private.enforce_fulfillment_state_transition()
returns trigger language plpgsql security definer set search_path='' as $$
declare allowed boolean := false;
begin
  if tg_table_name='sample_shipments' then
    if tg_op='INSERT' then
      if new.status<>'preparing' then raise exception '新样品记录必须从准备中开始'; end if;
    elsif new.status is distinct from old.status then
      allowed := (old.status='preparing' and new.status='shipped')
        or (old.status='shipped' and new.status='delivered')
        or (old.status='delivered' and new.status in ('feedback_received','closed'))
        or (old.status='feedback_received' and new.status='closed');
      if not allowed then raise exception '样品状态不能从 % 变更为 %',old.status,new.status; end if;
    end if;
    if new.status in ('shipped','delivered','feedback_received','closed') and (
      nullif(btrim(new.courier),'') is null or nullif(btrim(new.tracking_no),'') is null or new.shipped_at is null
    ) then raise exception '样品寄出后必须保留快递公司、快递单号和寄出时间'; end if;
    if new.delivered_at>clock_timestamp()+interval '5 minutes' then raise exception '样品签收时间不能晚于当前时间'; end if;
  elsif tg_table_name='sales_orders' then
    if tg_op='INSERT' then
      if new.status<>'draft' then raise exception '新订单必须从草稿开始'; end if;
    elsif new.status is distinct from old.status then
      allowed := (old.status='draft' and new.status in ('confirmed','cancelled'))
        or (old.status='confirmed' and new.status in ('deposit_pending','deposit_received','production','cancelled'))
        or (old.status='deposit_pending' and new.status in ('deposit_received','production','cancelled'))
        or (old.status='deposit_received' and new.status in ('production','cancelled'))
        or (old.status='production' and new.status in ('ready_to_ship','cancelled'))
        or (old.status='ready_to_ship' and new.status in ('shipped','cancelled'))
        or (old.status='shipped' and new.status='delivered')
        or (old.status='delivered' and new.status in ('after_sales','completed'))
        or (old.status='after_sales' and new.status='completed');
      if not allowed then raise exception '订单状态不能从 % 变更为 %',old.status,new.status; end if;
    end if;
    if new.delivered_at>clock_timestamp()+interval '5 minutes' then raise exception '实际交付时间不能晚于当前时间'; end if;
    if new.after_sales_status in ('open','processing') and new.status<>'after_sales' then
      raise exception '待处理或处理中的售后必须将订单状态设为售后中';
    end if;
    if new.status='after_sales' and new.after_sales_status not in ('open','processing') then
      raise exception '售后中订单必须选择待处理或处理中';
    end if;
  elsif tg_table_name='order_payments' then
    if tg_op='INSERT' and new.status='refunded' then raise exception '不能直接登记退款，须先有已到账记录'; end if;
    if tg_op='UPDATE' and new.status is distinct from old.status then
      allowed := (old.status='pending' and new.status='received')
        or (old.status='received' and new.status='refunded');
      if not allowed then raise exception '回款状态不能从 % 变更为 %',old.status,new.status; end if;
    end if;
    if new.status in ('received','refunded') and new.received_at is null then raise exception '到账或退款记录必须保留到账时间'; end if;
    if new.received_at>clock_timestamp()+interval '5 minutes' then raise exception '到账时间不能晚于当前时间'; end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_fulfillment_state_transition() from public,anon,authenticated;

drop trigger if exists sample_shipments_state_guard on public.sample_shipments;
create trigger sample_shipments_state_guard before insert or update on public.sample_shipments
for each row execute function private.enforce_fulfillment_state_transition();
drop trigger if exists sales_orders_state_guard on public.sales_orders;
create trigger sales_orders_state_guard before insert or update on public.sales_orders
for each row execute function private.enforce_fulfillment_state_transition();
drop trigger if exists order_payments_state_guard on public.order_payments;
create trigger order_payments_state_guard before insert or update on public.order_payments
for each row execute function private.enforce_fulfillment_state_transition();
