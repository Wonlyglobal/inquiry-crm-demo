import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('today workbench exposes the six required sales queues',()=>{
  for(const label of ['今日新分配','客户新回复','今日待跟进','逾期任务','待报价','即将失效客户'])
    assert.match(html,new RegExp(label));
});

test('pending quotation queue is actionable',()=>{
  assert.match(html,/pendingQuote=open\.filter/);
  assert.match(html,/label:"创建报价"/);
  assert.match(html,/data-open-sales-work/);
});

test('customer reply queue only shows durable open reply reminders',()=>{
  assert.match(html,/from\("email_reply_reminders"\).*eq\("owner_id",profile\.id\)\.eq\("status","open"\)/);
  assert.match(html,/replyRemindersResult\.data/);
  assert.doesNotMatch(html,/inquiries\.filter\(x=>latestMail\.get\(x\.id\)\?\.direction==="inbound"\)/);
});

test('unanswered assignments become overdue after their first-response deadline',()=>{
  assert.match(html,/assigned_at,first_contact_due_at,first_valid_contact_at/);
  assert.match(html,/x\.assigned_at&&!x\.first_valid_contact_at/);
  assert.match(html,/dueAt<now\)add\("overdue",1,x,`首次响应已逾期/);
});
