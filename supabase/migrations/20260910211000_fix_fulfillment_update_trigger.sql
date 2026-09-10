-- Avoid evaluating table-specific record fields across trigger branches.
create or replace function private.fulfillment_before_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_table_name in ('sample_shipments','sales_orders') then
    if new.inquiry_id is distinct from old.inquiry_id then
      raise exception '不能变更记录所属询盘';
    end if;
  elsif tg_table_name='order_payments' then
    if new.order_id is distinct from old.order_id then
      raise exception '不能变更回款所属订单';
    end if;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception '不能变更记录创建人';
  end if;
  new.updated_at=clock_timestamp();
  return new;
end;
$$;

revoke all on function private.fulfillment_before_update() from public,anon,authenticated;
