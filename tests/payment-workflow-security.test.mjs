import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915150000_secure_payment_status_workflow.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-payment-workflow-rollback.sql',import.meta.url),'utf8');

test('payment receipt and refund use an owner-scoped audited workflow',()=>{
  assert.match(sql,/create or replace function public\.update_order_payment_status/);
  assert.match(sql,/where id=\(select auth\.uid\(\)\) and active=true/);
  assert.match(sql,/actor\.role='sales' and inquiry_owner<>actor\.id/);
  assert.match(sql,/actor\.role not in \('owner','sales_manager'\)/);
  assert.match(sql,/for update of p/);
  assert.match(sql,/revoke all on public\.order_payments from authenticated/);
  assert.match(sql,/grant select,insert on public\.order_payments to authenticated/);
  assert.match(sql,/revoke all on function public\.update_order_payment_status\(uuid,text,timestamptz,text,text\) from public,anon/);
});

test('confirmed payment evidence is immutable and refunds retain separate evidence',()=>{
  assert.match(sql,/old\.status in \('received','refunded'\)/);
  assert.match(sql,/new\.amount is distinct from old\.amount/);
  assert.match(sql,/new\.reference_no is distinct from old\.reference_no/);
  assert.match(sql,/add column if not exists refunded_at timestamptz/);
  assert.match(sql,/add column if not exists refund_reference_no text/);
  assert.match(sql,/add column if not exists refund_reason text/);
  assert.match(sql,/order_payments_refund_evidence_check/);
});

test('fulfillment UI can confirm a pending payment and restrict refunds to managers',()=>{
  assert.match(html,/async function openPaymentStatus\(payment,order,inquiry\)/);
  assert.match(html,/supabase\.rpc\("update_order_payment_status"/);
  assert.match(html,/data-payment-progress/);
  assert.match(html,/确认到账/);
  assert.match(html,/登记退款/);
  assert.match(html,/canRefund=\["owner","sales_manager"\]\.includes\(profile\.role\)/);
  assert.match(html,/已到账必须填写银行流水号或凭证编号/);
});

test('production payment acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/PAYMENT_EVIDENCE_MUTATION_NOT_BLOCKED/);
  assert.match(rollbackSql,/next_status=>'received'/);
  assert.match(rollbackSql,/next_status=>'refunded'/);
  assert.match(rollbackSql,/rollback;/);
});
