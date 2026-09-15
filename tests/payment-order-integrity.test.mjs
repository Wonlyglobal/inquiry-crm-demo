import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915153000_enforce_payment_order_totals.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-payment-order-integrity-rollback.sql',import.meta.url),'utf8');

test('payment currency and cumulative amount follow the locked order',()=>{
  assert.match(sql,/from public\.sales_orders o[\s\S]*for update of o/);
  assert.match(sql,/new\.currency:=upper\(btrim\(new\.currency\)\)/);
  assert.match(sql,/new\.currency<>upper\(btrim\(parent_order\.currency\)\)/);
  assert.match(sql,/p\.status<>'refunded'/);
  assert.match(sql,/p\.id<>new\.id/);
  assert.match(sql,/allocated>parent_order\.total_amount/);
  assert.match(sql,/order_payments_total_guard/);
});

test('deposit-received order status requires receipt evidence',()=>{
  assert.match(sql,/new\.status='deposit_received'/);
  assert.match(sql,/p\.payment_type='deposit' and p\.status='received'/);
  assert.match(sql,/sales_orders_payment_alignment_guard/);
  assert.match(sql,/revoke all on function private\.enforce_order_payment_alignment\(\) from public,anon,authenticated/);
});

test('production payment-order acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/CURRENCY_MISMATCH_NOT_BLOCKED/);
  assert.match(rollbackSql,/OVERALLOCATION_NOT_BLOCKED/);
  assert.match(rollbackSql,/DEPOSIT_STATUS_WITHOUT_RECEIPT_NOT_BLOCKED/);
  assert.match(rollbackSql,/update_order_payment_status/);
  assert.match(rollbackSql,/^rollback;/m);
});
