import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915173000_require_pending_payment_creation.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-payment-creation-rollback.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('new receivables cannot bypass the audited receipt transition',()=>{
  assert.match(sql,/tg_op='INSERT'/);
  assert.match(sql,/new\.status<>'pending'/);
  assert.match(sql,/new\.received_at is not null/);
  assert.match(sql,/new\.received_note/);
  assert.match(sql,/new\.refunded_at/);
  assert.match(sql,/新回款只能先登记为待回款/);
  assert.match(sql,/revoke all on function private\.enforce_payment_evidence\(\) from public,anon,authenticated/);
});

test('payment form only creates pending receivables and explains confirmation',()=>{
  assert.match(html,/新增款项统一先登记为“待回款”/);
  assert.match(html,/status:"pending"/);
  assert.match(html,/登记待回款/);
  assert.doesNotMatch(html,/id="order-payment-status"/);
  assert.doesNotMatch(html,/id="order-payment-received"/);
  assert.doesNotMatch(html,/id="order-payment-reference"/);
});

test('production payment creation acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/DIRECT_RECEIVED_INSERT_NOT_BLOCKED/);
  assert.match(rollbackSql,/update_order_payment_status/);
  assert.match(rollbackSql,/^rollback;/m);
});
