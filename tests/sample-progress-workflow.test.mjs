import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915170000_atomic_sample_progress.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-sample-progress-rollback.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('sample progress has an owner-scoped atomic workflow and visible event table',()=>{
  assert.match(sql,/create table if not exists public\.sample_shipment_events/);
  assert.match(sql,/create policy sample_shipment_events_read/);
  assert.match(sql,/private\.can_read_fulfillment/);
  assert.match(sql,/create or replace function public\.update_sample_shipment_progress/);
  assert.match(sql,/actor\.role not in \('owner','sales_manager','sales'\)/);
  assert.match(sql,/actor\.role='sales' and inquiry_owner<>actor\.id/);
  assert.match(sql,/insert into public\.sample_shipment_events/);
  assert.match(sql,/revoke all on public\.sample_shipments from authenticated/);
  assert.match(sql,/grant select,insert on public\.sample_shipments to authenticated/);
});

test('sample delivery and feedback evidence survives later lifecycle states',()=>{
  assert.match(sql,/new\.status in \('delivered','feedback_received','closed'\) and new\.delivered_at is null/);
  assert.match(sql,/new\.status='feedback_received'/);
  assert.match(sql,/old\.status='feedback_received' and new\.status='closed'/);
  assert.match(sql,/sample_shipments_evidence_history_guard/);
});

test('sample UI uses the server workflow and renders its complete history',()=>{
  assert.match(html,/supabase\.rpc\("update_sample_shipment_progress"/);
  assert.match(html,/sample_shipment_events/);
  assert.match(html,/样品进展历史/);
  assert.match(html,/sampleEventRows/);
  assert.match(html,/loadAllCustomerRows\(\(\)=>supabase\.from\("sample_shipment_events"\)/);
  assert.doesNotMatch(html,/from\("sample_shipments"\)\.update/);
});

test('production sample acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/MISSING_SHIPPING_NOT_BLOCKED/);
  assert.match(rollbackSql,/MISSING_FEEDBACK_NOT_BLOCKED/);
  assert.match(rollbackSql,/event_count<>5/);
  assert.match(rollbackSql,/^rollback;/m);
});
