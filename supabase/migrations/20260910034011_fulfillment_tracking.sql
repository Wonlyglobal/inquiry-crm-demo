-- Sample, order, payment, delivery and after-sales tracking.

create table if not exists public.sample_shipments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  contents text not null,
  quantity numeric(12,2),
  courier text,
  tracking_no text,
  status text not null default 'preparing' check (status in ('preparing','shipped','delivered','feedback_received','closed')),
  shipped_at timestamptz,
  expected_arrival_at timestamptz,
  delivered_at timestamptz,
  customer_feedback text,
  feedback_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity is null or quantity > 0),
  check (status <> 'shipped' or (tracking_no is not null and shipped_at is not null)),
  check (status <> 'delivered' or delivered_at is not null),
  check (status <> 'feedback_received' or (customer_feedback is not null and feedback_at is not null))
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete restrict,
  order_no text not null unique,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_amount numeric(18,2) not null check (total_amount >= 0),
  status text not null default 'draft' check (status in ('draft','confirmed','deposit_pending','deposit_received','production','ready_to_ship','shipped','delivered','after_sales','completed','cancelled')),
  expected_delivery_at timestamptz,
  delivered_at timestamptz,
  after_sales_status text not null default 'none' check (after_sales_status in ('none','open','processing','resolved')),
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'delivered' or delivered_at is not null)
);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  payment_type text not null check (payment_type in ('deposit','balance','other')),
  amount numeric(18,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','received','refunded')),
  expected_at timestamptz,
  received_at timestamptz,
  reference_no text,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'received' or received_at is not null)
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  event_type text not null check (event_type in ('production','delivery','after_sales','status_change','note')),
  status text,
  detail text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists sample_shipments_inquiry_updated_idx on public.sample_shipments(inquiry_id,updated_at desc);
create index if not exists sales_orders_inquiry_updated_idx on public.sales_orders(inquiry_id,updated_at desc);
create index if not exists sales_orders_status_updated_idx on public.sales_orders(status,updated_at desc) where status not in ('completed','cancelled');
create index if not exists order_payments_order_created_idx on public.order_payments(order_id,created_at desc);
create index if not exists order_payments_pending_idx on public.order_payments(expected_at) where status='pending';
create index if not exists order_events_order_occurred_idx on public.order_events(order_id,occurred_at desc);

alter table public.sample_shipments enable row level security;
alter table public.sales_orders enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_events enable row level security;

create or replace function private.can_read_fulfillment(target_inquiry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active=true
      and (
        p.role in ('owner','sales_manager','marketing')
        or exists (
          select 1 from public.inquiries i
          where i.id=target_inquiry_id and i.owner_id=p.id
        )
      )
  )
$$;

create or replace function private.can_write_fulfillment(target_inquiry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active=true
      and (
        p.role in ('owner','sales_manager')
        or (p.role='sales' and exists (
          select 1 from public.inquiries i
          where i.id=target_inquiry_id and i.owner_id=p.id
        ))
      )
  )
$$;

revoke all on function private.can_read_fulfillment(uuid) from public,anon,authenticated;
revoke all on function private.can_write_fulfillment(uuid) from public,anon,authenticated;
grant execute on function private.can_read_fulfillment(uuid) to authenticated;
grant execute on function private.can_write_fulfillment(uuid) to authenticated;

drop policy if exists sample_shipments_read on public.sample_shipments;
create policy sample_shipments_read on public.sample_shipments for select to authenticated
using ((select private.can_read_fulfillment(inquiry_id)));
drop policy if exists sample_shipments_insert on public.sample_shipments;
create policy sample_shipments_insert on public.sample_shipments for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.can_write_fulfillment(inquiry_id)));
drop policy if exists sample_shipments_update on public.sample_shipments;
create policy sample_shipments_update on public.sample_shipments for update to authenticated
using ((select private.can_write_fulfillment(inquiry_id)))
with check ((select private.can_write_fulfillment(inquiry_id)));

drop policy if exists sales_orders_read on public.sales_orders;
create policy sales_orders_read on public.sales_orders for select to authenticated
using ((select private.can_read_fulfillment(inquiry_id)));
drop policy if exists sales_orders_insert on public.sales_orders;
create policy sales_orders_insert on public.sales_orders for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.can_write_fulfillment(inquiry_id)));
drop policy if exists sales_orders_update on public.sales_orders;
create policy sales_orders_update on public.sales_orders for update to authenticated
using ((select private.can_write_fulfillment(inquiry_id)))
with check ((select private.can_write_fulfillment(inquiry_id)));

drop policy if exists order_payments_read on public.order_payments;
create policy order_payments_read on public.order_payments for select to authenticated
using (exists (select 1 from public.sales_orders o where o.id=order_payments.order_id and (select private.can_read_fulfillment(o.inquiry_id))));
drop policy if exists order_payments_insert on public.order_payments;
create policy order_payments_insert on public.order_payments for insert to authenticated
with check (created_by=(select auth.uid()) and exists (select 1 from public.sales_orders o where o.id=order_payments.order_id and (select private.can_write_fulfillment(o.inquiry_id))));
drop policy if exists order_payments_update on public.order_payments;
create policy order_payments_update on public.order_payments for update to authenticated
using (exists (select 1 from public.sales_orders o where o.id=order_payments.order_id and (select private.can_write_fulfillment(o.inquiry_id))))
with check (exists (select 1 from public.sales_orders o where o.id=order_payments.order_id and (select private.can_write_fulfillment(o.inquiry_id))));

drop policy if exists order_events_read on public.order_events;
create policy order_events_read on public.order_events for select to authenticated
using (exists (select 1 from public.sales_orders o where o.id=order_events.order_id and (select private.can_read_fulfillment(o.inquiry_id))));
drop policy if exists order_events_insert on public.order_events;
create policy order_events_insert on public.order_events for insert to authenticated
with check (created_by=(select auth.uid()) and exists (select 1 from public.sales_orders o where o.id=order_events.order_id and (select private.can_write_fulfillment(o.inquiry_id))));

create or replace function private.fulfillment_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name in ('sample_shipments','sales_orders') and new.inquiry_id is distinct from old.inquiry_id then
    raise exception '不能变更记录所属询盘';
  end if;
  if tg_table_name='order_payments' and new.order_id is distinct from old.order_id then
    raise exception '不能变更回款所属订单';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception '不能变更记录创建人';
  end if;
  new.updated_at=clock_timestamp();
  return new;
end;
$$;
revoke all on function private.fulfillment_before_update() from public,anon,authenticated;

drop trigger if exists sample_shipments_before_update on public.sample_shipments;
create trigger sample_shipments_before_update before update on public.sample_shipments for each row execute function private.fulfillment_before_update();
drop trigger if exists sales_orders_before_update on public.sales_orders;
create trigger sales_orders_before_update before update on public.sales_orders for each row execute function private.fulfillment_before_update();
drop trigger if exists order_payments_before_update on public.order_payments;
create trigger order_payments_before_update before update on public.order_payments for each row execute function private.fulfillment_before_update();

create or replace function private.audit_fulfillment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_inquiry_id uuid;
  record_id text;
begin
  if tg_table_name in ('sample_shipments','sales_orders') then
    linked_inquiry_id=coalesce(new.inquiry_id,old.inquiry_id);
  else
    select o.inquiry_id into linked_inquiry_id
    from public.sales_orders o where o.id=coalesce(new.order_id,old.order_id);
  end if;
  record_id=coalesce(new.id,old.id)::text;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(
    auth.uid(),tg_table_name,linked_inquiry_id,lower(tg_op),
    case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end,
    case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end,
    concat('履约记录 ',record_id,' ',lower(tg_op))
  );
  return new;
end;
$$;
revoke all on function private.audit_fulfillment_change() from public,anon,authenticated;

drop trigger if exists sample_shipments_audit on public.sample_shipments;
create trigger sample_shipments_audit after insert or update on public.sample_shipments for each row execute function private.audit_fulfillment_change();
drop trigger if exists sales_orders_audit on public.sales_orders;
create trigger sales_orders_audit after insert or update on public.sales_orders for each row execute function private.audit_fulfillment_change();
drop trigger if exists order_payments_audit on public.order_payments;
create trigger order_payments_audit after insert or update on public.order_payments for each row execute function private.audit_fulfillment_change();
drop trigger if exists order_events_audit on public.order_events;
create trigger order_events_audit after insert on public.order_events for each row execute function private.audit_fulfillment_change();

revoke all on public.sample_shipments,public.sales_orders,public.order_payments,public.order_events from anon;
grant select,insert,update on public.sample_shipments,public.sales_orders,public.order_payments to authenticated;
grant select,insert on public.order_events to authenticated;
grant select,insert,update,delete on public.sample_shipments,public.sales_orders,public.order_payments,public.order_events to service_role;
