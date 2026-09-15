-- Require durable shipping/delivery evidence and route all order progress through one audited RPC.
alter table public.sales_orders
  add column if not exists shipping_carrier text,
  add column if not exists shipping_tracking_no text,
  add column if not exists shipped_at timestamptz;

create or replace function private.enforce_order_delivery_evidence()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.shipped_at>clock_timestamp()+interval '5 minutes' then raise exception '发货时间不能晚于当前时间'; end if;
  if new.delivered_at>clock_timestamp()+interval '5 minutes' then raise exception '实际交付时间不能晚于当前时间'; end if;

  if new.status in ('shipped','delivered','after_sales','completed') and (
    nullif(btrim(new.shipping_carrier),'') is null
    or nullif(btrim(new.shipping_tracking_no),'') is null
    or new.shipped_at is null
  ) then
    raise exception '已发货及后续状态必须保留承运商、运单号和发货时间';
  end if;
  if new.status in ('delivered','after_sales','completed') and new.delivered_at is null then
    raise exception '已交付及后续状态必须保留实际交付时间';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_order_delivery_evidence() from public,anon,authenticated;
drop trigger if exists sales_orders_delivery_evidence_guard on public.sales_orders;
create trigger sales_orders_delivery_evidence_guard
before insert or update on public.sales_orders
for each row execute function private.enforce_order_delivery_evidence();

drop function if exists public.update_sales_order_progress(uuid,text,timestamptz,timestamptz,text,text,text);
create function public.update_sales_order_progress(
  target_order_id uuid,
  next_status text,
  next_expected_delivery_at timestamptz default null,
  next_delivered_at timestamptz default null,
  next_after_sales_status text default 'none',
  progress_event_type text default 'status_change',
  progress_detail text default null,
  next_shipping_carrier text default null,
  next_shipping_tracking_no text default null,
  next_shipped_at timestamptz default null
)
returns public.sales_orders
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles;
  current_order public.sales_orders;
  saved public.sales_orders;
  inquiry_owner uuid;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null then raise exception '当前账号未启用'; end if;
  if actor.role not in ('owner','sales_manager','sales') then raise exception '无权更新订单履约'; end if;
  if nullif(btrim(progress_detail),'') is null then raise exception '订单进展说明不能为空'; end if;
  if progress_event_type not in ('production','delivery','after_sales','status_change','note') then raise exception '订单进展类型不正确'; end if;

  select o.* into current_order from public.sales_orders o where o.id=target_order_id for update of o;
  if current_order.id is null then raise exception '订单不存在'; end if;
  select i.owner_id into inquiry_owner from public.inquiries i where i.id=current_order.inquiry_id;
  if actor.role='sales' and inquiry_owner<>actor.id then raise exception '只能更新本人当前负责客户的订单'; end if;

  update public.sales_orders
  set status=next_status,
      expected_delivery_at=next_expected_delivery_at,
      delivered_at=next_delivered_at,
      after_sales_status=next_after_sales_status,
      shipping_carrier=nullif(btrim(next_shipping_carrier),''),
      shipping_tracking_no=nullif(btrim(next_shipping_tracking_no),''),
      shipped_at=next_shipped_at
  where id=current_order.id returning * into saved;

  insert into public.order_events(order_id,event_type,status,detail,occurred_at,created_by)
  values(saved.id,progress_event_type,saved.status,btrim(progress_detail),clock_timestamp(),actor.id);
  return saved;
end;
$$;

revoke all on public.sales_orders from authenticated;
grant select,insert on public.sales_orders to authenticated;
revoke all on function public.update_sales_order_progress(uuid,text,timestamptz,timestamptz,text,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.update_sales_order_progress(uuid,text,timestamptz,timestamptz,text,text,text,text,text,timestamptz) to authenticated;
