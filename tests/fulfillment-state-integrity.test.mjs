import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260910172000_fulfillment_state_integrity.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('sample lifecycle is sequential and shipment evidence is mandatory',()=>{
  assert.match(sql,/old\.status='preparing' and new\.status='shipped'/);
  assert.match(sql,/old\.status='shipped' and new\.status='delivered'/);
  assert.match(sql,/快递公司、快递单号和寄出时间/);
});

test('order lifecycle blocks skipping critical fulfillment stages',()=>{
  assert.match(sql,/old\.status='draft' and new\.status in \('confirmed','cancelled'\)/);
  assert.match(sql,/old\.status='production' and new\.status in \('ready_to_ship','cancelled'\)/);
  assert.match(sql,/old\.status='shipped' and new\.status='delivered'/);
});

test('payment lifecycle cannot start as a refund or move backwards',()=>{
  assert.match(sql,/new\.status='refunded'.*须先有已到账记录/);
  assert.match(sql,/old\.status='pending' and new\.status='received'/);
  assert.match(sql,/old\.status='received' and new\.status='refunded'/);
});

test('fulfillment view shows complete order event history',()=>{
  assert.match(html,/订单进展历史/);
  assert.match(html,/events\.map\(item/);
  assert.match(html,/进展说明/);
});

test('fulfillment list paginates inquiries, samples and orders',()=>{
  const start=html.indexOf('} else if(view==="fulfillment")');
  const branch=html.slice(start,html.indexOf('} else if(view==="customers")',start));
  assert.match(branch,/loadModuleRowsPaged\(inquiryQuery\)/);
  assert.match(branch,/from\("sample_shipments"\).*\.range\(from,to\)/);
  assert.match(branch,/from\("sales_orders"\).*\.range\(from,to\)/);
  assert.doesNotMatch(branch,/\.limit\(500\)/);
  assert.doesNotMatch(branch,/\.limit\(1000\)/);
});

test('fulfillment controls only expose valid next actions',()=>{
  assert.match(html,/const orderNextStatuses=/);
  assert.match(html,/selectable=\[order\.status,\.\.\.\(orderNextStatuses\[order\.status\]/);
  assert.match(html,/sample\.status==="feedback_received"/);
  assert.match(html,/完成跟踪/);
  assert.doesNotMatch(html,/id="order-payment-status"[^`]*option value="refunded"/);
});
