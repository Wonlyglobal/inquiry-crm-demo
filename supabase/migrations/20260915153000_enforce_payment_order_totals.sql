-- Keep payment plans and receipts aligned with their authoritative order.
create or replace function private.enforce_payment_order_totals()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  parent_order public.sales_orders;
  allocated numeric(18,2);
begin
  select o.* into parent_order
  from public.sales_orders o
  where o.id=new.order_id
  for update of o;
  if parent_order.id is null then raise exception '回款所属订单不存在'; end if;

  new.currency:=upper(btrim(new.currency));
  if new.currency<>upper(btrim(parent_order.currency)) then
    raise exception '回款币种 % 必须与订单币种 % 一致',new.currency,parent_order.currency;
  end if;

  select coalesce(sum(p.amount),0) into allocated
  from public.order_payments p
  where p.order_id=new.order_id
    and p.status<>'refunded'
    and p.id<>new.id;
  if new.status<>'refunded' then allocated:=allocated+new.amount; end if;
  if allocated>parent_order.total_amount then
    raise exception '待收及已收回款合计 % 不能超过订单总额 %',allocated,parent_order.total_amount;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_payment_order_totals() from public,anon,authenticated;

drop trigger if exists order_payments_total_guard on public.order_payments;
create trigger order_payments_total_guard
before insert or update on public.order_payments
for each row execute function private.enforce_payment_order_totals();

create or replace function private.enforce_order_payment_alignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='deposit_received' and old.status is distinct from new.status
     and not exists(
       select 1 from public.order_payments p
       where p.order_id=new.id and p.payment_type='deposit' and p.status='received'
     ) then
    raise exception '订单标记已收定金前必须先确认定金到账';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_order_payment_alignment() from public,anon,authenticated;

drop trigger if exists sales_orders_payment_alignment_guard on public.sales_orders;
create trigger sales_orders_payment_alignment_guard
before update on public.sales_orders
for each row execute function private.enforce_order_payment_alignment();
