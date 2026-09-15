-- Make payment receipt and refund changes explicit, immutable and auditable.
alter table public.order_payments
  add column if not exists received_note text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reference_no text,
  add column if not exists refund_reason text;

alter table public.order_payments drop constraint if exists order_payments_refund_evidence_check;
alter table public.order_payments add constraint order_payments_refund_evidence_check check (
  status<>'refunded' or (
    refunded_at is not null
    and nullif(btrim(refund_reference_no),'') is not null
    and nullif(btrim(refund_reason),'') is not null
  )
);

create or replace function private.enforce_payment_evidence()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status in ('received','refunded')
     and nullif(btrim(new.reference_no),'') is null then
    raise exception '已到账回款必须填写银行流水号或凭证编号';
  end if;

  if tg_op='UPDATE' and old.status in ('received','refunded') and (
    new.payment_type is distinct from old.payment_type
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.received_at is distinct from old.received_at
    or new.reference_no is distinct from old.reference_no
  ) then
    raise exception '已到账回款的类型、金额、币种、到账时间和原始凭证不可改写';
  end if;

  if new.refunded_at>clock_timestamp()+interval '5 minutes' then
    raise exception '退款时间不能晚于当前时间';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_payment_evidence() from public,anon,authenticated;

drop trigger if exists order_payments_evidence_guard on public.order_payments;
create trigger order_payments_evidence_guard
before insert or update on public.order_payments
for each row execute function private.enforce_payment_evidence();

create or replace function public.update_order_payment_status(
  target_payment_id uuid,
  next_status text,
  status_at timestamptz,
  status_reference text,
  status_note text
)
returns public.order_payments
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles;
  payment public.order_payments;
  inquiry_owner uuid;
begin
  select * into actor from public.profiles
  where id=(select auth.uid()) and active=true;
  if actor.id is null then raise exception '当前账号未启用'; end if;
  if actor.role not in ('owner','sales_manager','sales') then raise exception '无权处理回款'; end if;
  if status_at is null or status_at>clock_timestamp()+interval '5 minutes' then
    raise exception '请填写有效的业务发生时间';
  end if;
  if nullif(btrim(status_reference),'') is null then raise exception '请填写流水号或凭证编号'; end if;
  if nullif(btrim(status_note),'') is null then raise exception '请填写本次回款操作说明'; end if;

  select p.* into payment
  from public.order_payments p
  where p.id=target_payment_id
  for update of p;
  if payment.id is null then raise exception '回款记录不存在'; end if;
  select i.owner_id into inquiry_owner
  from public.sales_orders o join public.inquiries i on i.id=o.inquiry_id
  where o.id=payment.order_id;
  if actor.role='sales' and inquiry_owner<>actor.id then raise exception '只能处理本人当前负责客户的回款'; end if;

  if payment.status='pending' and next_status='received' then
    update public.order_payments set
      status='received',received_at=status_at,reference_no=btrim(status_reference),received_note=btrim(status_note)
    where id=payment.id returning * into payment;
  elsif payment.status='received' and next_status='refunded' then
    if actor.role not in ('owner','sales_manager') then raise exception '只有销售主管或老板可登记退款'; end if;
    update public.order_payments set
      status='refunded',refunded_at=status_at,refund_reference_no=btrim(status_reference),refund_reason=btrim(status_note)
    where id=payment.id returning * into payment;
  else
    raise exception '回款状态不能从 % 变更为 %',payment.status,next_status;
  end if;

  return payment;
end;
$$;

revoke all on public.order_payments from authenticated;
grant select,insert on public.order_payments to authenticated;
revoke all on function public.update_order_payment_status(uuid,text,timestamptz,text,text) from public,anon;
grant execute on function public.update_order_payment_status(uuid,text,timestamptz,text,text) to authenticated;
