import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915180000_require_approved_win_for_orders.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-order-creation-rollback.sql',import.meta.url),'utf8');
const atomicCreation=fs.readFileSync(new URL('../supabase/migrations/20260915210000_atomic_sales_order_creation.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('orders require a locked approved win and stay within its value',()=>{
  assert.match(sql,/from public\.inquiries i where i\.id=new\.inquiry_id for update of i/);
  assert.match(sql,/deal\.status<>'won'/);
  assert.match(sql,/new\.currency<>upper\(btrim\(deal\.won_currency\)\)/);
  assert.match(sql,/o\.status<>'cancelled'/);
  assert.match(sql,/allocated\+new\.total_amount>deal\.won_amount/);
  assert.match(sql,/sales_orders_approved_win_guard/);
  assert.match(sql,/revoke all on function private\.enforce_order_approved_win\(\) from public,anon,authenticated/);
});

test('order creation form is only rendered after an approved win',()=>{
  assert.match(html,/canCreateOrder=canWrite&&inquiry\.status==="won"/);
  assert.match(html,/\$\{canCreateOrder\?`<form id="order-create-form"/);
  assert.match(html,/销售订单须在成交申请经主管审批后建立/);
});

test('order and opening event are created atomically by an owner-scoped workflow',()=>{
  assert.match(atomicCreation,/create or replace function public\.create_sales_order/);
  assert.match(atomicCreation,/where i\.id=target_inquiry_id for update of i/);
  assert.match(atomicCreation,/actor\.role='sales' and deal\.owner_id is distinct from actor\.id/);
  assert.match(atomicCreation,/insert into public\.sales_orders/);
  assert.match(atomicCreation,/insert into public\.order_events/);
  assert.match(atomicCreation,/drop policy if exists sales_orders_insert/);
  assert.match(atomicCreation,/revoke insert on public\.sales_orders from authenticated/);
  assert.match(atomicCreation,/grant execute on function public\.create_sales_order\(uuid,text,numeric,text,timestamptz,text\) to authenticated/);
  assert.match(html,/supabase\.rpc\("create_sales_order"/);
  assert.doesNotMatch(html,/supabase\.from\("sales_orders"\)\.insert/);
});

test('production order eligibility acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/NON_WON_ORDER_NOT_BLOCKED/);
  assert.match(rollbackSql,/ORDER_CURRENCY_NOT_BLOCKED/);
  assert.match(rollbackSql,/ORDER_TOTAL_NOT_BLOCKED/);
  assert.match(rollbackSql,/^rollback;/m);
});
