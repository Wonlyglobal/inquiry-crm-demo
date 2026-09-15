-- Preserve after-sales resolution evidence when an order is completed.
create or replace function private.enforce_after_sales_resolution()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status='after_sales' and new.status='completed'
     and new.after_sales_status<>'resolved' then
    raise exception '售后问题必须标记为已解决后才能完成订单';
  end if;

  if old.status='delivered' and new.status='completed'
     and new.after_sales_status<>'none' then
    raise exception '未进入售后流程的订单不能伪造售后已解决状态';
  end if;

  if new.after_sales_status='resolved' and not (
    (old.status='after_sales' and new.status='completed')
    or (old.status='completed' and old.after_sales_status='resolved' and new.status='completed')
  ) then
    raise exception '售后已解决只能由售后中订单关闭时记录';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_after_sales_resolution() from public,anon,authenticated;

drop trigger if exists sales_orders_after_sales_resolution_guard on public.sales_orders;
create trigger sales_orders_after_sales_resolution_guard
before update on public.sales_orders
for each row execute function private.enforce_after_sales_resolution();
