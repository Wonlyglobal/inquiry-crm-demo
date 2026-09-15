-- Create each sales order and its opening history event in one authorized transaction.
create or replace function public.create_sales_order(
  target_inquiry_id uuid,
  target_order_no text,
  target_total_amount numeric,
  target_currency text,
  target_expected_delivery_at timestamptz default null,
  target_notes text default null
)
returns public.sales_orders
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles;
  deal public.inquiries;
  saved public.sales_orders;
  normalized_order_no text:=nullif(btrim(target_order_no),'');
  normalized_currency text:=upper(btrim(target_currency));
begin
  select * into actor from public.profiles
  where id=(select auth.uid()) and active=true;
  if actor.id is null or actor.role not in ('owner','sales_manager','sales') then
    raise exception '无权创建销售订单';
  end if;
  if normalized_order_no is null or length(normalized_order_no)>120 then
    raise exception '请填写 120 字符以内的订单号';
  end if;
  if target_total_amount is null or target_total_amount<=0 then
    raise exception '订单金额必须大于 0';
  end if;
  if normalized_currency !~ '^[A-Z]{3}$' then
    raise exception '订单币种必须为 3 位大写代码';
  end if;
  if target_expected_delivery_at is not null
     and target_expected_delivery_at<clock_timestamp()-interval '5 minutes' then
    raise exception '预计交付时间不能早于当前时间';
  end if;

  select i.* into deal from public.inquiries i
  where i.id=target_inquiry_id for update of i;
  if deal.id is null then raise exception '询盘不存在'; end if;
  if actor.role='sales' and deal.owner_id is distinct from actor.id then
    raise exception '只能为本人当前负责的客户创建订单';
  end if;
  if deal.status<>'won' or deal.won_amount is null or deal.won_amount<=0
     or nullif(btrim(deal.won_currency),'') is null then
    raise exception '销售订单须在成交申请经主管审批后建立';
  end if;

  insert into public.sales_orders(
    inquiry_id,order_no,total_amount,currency,status,
    expected_delivery_at,notes,created_by
  ) values(
    deal.id,normalized_order_no,target_total_amount,normalized_currency,'draft',
    target_expected_delivery_at,nullif(btrim(target_notes),''),actor.id
  ) returning * into saved;

  insert into public.order_events(order_id,event_type,status,detail,occurred_at,created_by)
  values(saved.id,'status_change','draft','创建销售订单：'||saved.order_no,clock_timestamp(),actor.id);

  return saved;
end;
$$;

drop policy if exists sales_orders_insert on public.sales_orders;
revoke insert on public.sales_orders from authenticated;
grant select on public.sales_orders to authenticated;
revoke all on function public.create_sales_order(uuid,text,numeric,text,timestamptz,text) from public,anon;
grant execute on function public.create_sales_order(uuid,text,numeric,text,timestamptz,text) to authenticated;
