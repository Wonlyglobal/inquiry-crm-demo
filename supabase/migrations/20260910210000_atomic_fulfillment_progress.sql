-- Keep an order status change and its progress event atomic.
create or replace function public.update_sales_order_progress(
  target_order_id uuid,
  next_status text,
  next_expected_delivery_at timestamptz default null,
  next_delivered_at timestamptz default null,
  next_after_sales_status text default 'none',
  progress_event_type text default 'status_change',
  progress_detail text default null
)
returns public.sales_orders
language plpgsql
security invoker
set search_path=''
as $$
declare
  saved public.sales_orders;
begin
  if nullif(btrim(progress_detail),'') is null then
    raise exception '订单进展说明不能为空';
  end if;
  if progress_event_type not in ('production','delivery','after_sales','status_change','note') then
    raise exception '订单进展类型不正确';
  end if;

  update public.sales_orders
  set status=next_status,
      expected_delivery_at=next_expected_delivery_at,
      delivered_at=next_delivered_at,
      after_sales_status=next_after_sales_status
  where id=target_order_id
  returning * into saved;

  if saved.id is null then raise exception '订单不存在或无权更新'; end if;

  insert into public.order_events(
    order_id,event_type,status,detail,occurred_at,created_by
  ) values (
    saved.id,progress_event_type,saved.status,trim(progress_detail),clock_timestamp(),auth.uid()
  );

  return saved;
end;
$$;

revoke all on function public.update_sales_order_progress(uuid,text,timestamptz,timestamptz,text,text,text) from public,anon;
grant execute on function public.update_sales_order_progress(uuid,text,timestamptz,timestamptz,text,text,text) to authenticated;
