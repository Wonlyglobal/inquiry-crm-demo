import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915160000_secure_order_delivery_evidence.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-order-delivery-evidence-rollback.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('shipping and delivery states require durable evidence',()=>{
  assert.match(sql,/add column if not exists shipping_carrier/);
  assert.match(sql,/new\.status in \('shipped','delivered','after_sales','completed'\)/);
  assert.match(sql,/shipping_tracking_no/);
  assert.match(sql,/new\.shipped_at is null/);
  assert.match(sql,/new\.status in \('delivered','after_sales','completed'\) and new\.delivered_at is null/);
  assert.match(sql,/sales_orders_delivery_evidence_guard/);
});

test('order progress uses an owner-scoped definer workflow instead of direct table updates',()=>{
  assert.match(sql,/create function public\.update_sales_order_progress/);
  assert.match(sql,/security definer/);
  assert.match(sql,/actor\.role not in \('owner','sales_manager','sales'\)/);
  assert.match(sql,/actor\.role='sales' and inquiry_owner<>actor\.id/);
  assert.match(sql,/revoke all on public\.sales_orders from authenticated/);
  assert.match(sql,/grant select,insert on public\.sales_orders to authenticated/);
  assert.match(sql,/revoke all on function public\.update_sales_order_progress\(uuid,text,timestamptz,timestamptz,text,text,text,text,text,timestamptz\) from public,anon/);
});

test('fulfillment UI captures and displays order shipping evidence',()=>{
  assert.match(html,/id="order-progress-carrier"/);
  assert.match(html,/id="order-progress-tracking"/);
  assert.match(html,/id="order-progress-shipped"/);
  assert.match(html,/next_shipping_carrier:/);
  assert.match(html,/next_shipping_tracking_no:/);
  assert.match(html,/next_shipped_at:/);
  assert.match(html,/shipping_tracking_no/);
});

test('production delivery acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/SHIPPING_EVIDENCE_NOT_BLOCKED/);
  assert.match(rollbackSql,/DELIVERY_TIME_NOT_BLOCKED/);
  assert.match(rollbackSql,/update_sales_order_progress/);
  assert.match(rollbackSql,/^rollback;/m);
});
