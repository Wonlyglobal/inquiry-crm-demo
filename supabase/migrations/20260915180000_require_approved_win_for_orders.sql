-- Orders belong to an approved win and cannot exceed its locked commercial value.
create or replace function private.enforce_order_approved_win()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  deal public.inquiries;
  allocated numeric(18,2);
begin
  select i.* into deal from public.inquiries i where i.id=new.inquiry_id for update of i;
  if deal.id is null then raise exception '订单所属询盘不存在'; end if;
  if deal.status<>'won' or deal.won_amount is null or deal.won_amount<=0
     or nullif(btrim(deal.won_currency),'') is null then
    raise exception '销售订单须在成交申请经主管审批后建立';
  end if;

  new.currency:=upper(btrim(new.currency));
  if new.currency<>upper(btrim(deal.won_currency)) then
    raise exception '订单币种 % 必须与审批成交币种 % 一致',new.currency,deal.won_currency;
  end if;
  select coalesce(sum(o.total_amount),0) into allocated from public.sales_orders o
  where o.inquiry_id=new.inquiry_id and o.status<>'cancelled' and o.id<>new.id;
  if allocated+new.total_amount>deal.won_amount then
    raise exception '未取消订单合计 % 不能超过审批成交额 %',allocated+new.total_amount,deal.won_amount;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_order_approved_win() from public,anon,authenticated;
drop trigger if exists sales_orders_approved_win_guard on public.sales_orders;
create trigger sales_orders_approved_win_guard before insert on public.sales_orders
for each row execute function private.enforce_order_approved_win();
