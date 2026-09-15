import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915183000_lock_order_events_to_workflow.sql',import.meta.url),'utf8');
const orderSql=fs.readFileSync(new URL('../supabase/migrations/20260915160000_secure_order_delivery_evidence.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-order-event-integrity-rollback.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('browser roles can read but cannot forge order history',()=>{
  assert.match(sql,/revoke all on public\.order_events from authenticated/);
  assert.match(sql,/grant select on public\.order_events to authenticated/);
  assert.match(sql,/grant select,insert,update,delete on public\.order_events to service_role/);
  assert.match(orderSql,/update public\.sales_orders[\s\S]*insert into public\.order_events/);
  assert.match(orderSql,/security definer/);
  assert.doesNotMatch(html,/from\("order_events"\)\.insert/);
});

test('production order history acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/set local role authenticated/);
  assert.match(rollbackSql,/DIRECT_ORDER_EVENT_NOT_BLOCKED/);
  assert.match(rollbackSql,/event_count<>1/);
  assert.match(rollbackSql,/^rollback;/m);
});
