import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('today workbench exposes the six required sales queues',()=>{
  for(const label of ['今日新分配','客户新回复','今日待跟进','逾期任务','待报价','即将失效客户'])
    assert.match(html,new RegExp(label));
});

test('today workbench loads complete inquiry and stage history datasets',()=>{
  assert.match(html,/async function loadAllDashboardInquiries\(\)/);
  assert.match(html,/async function loadAllDashboardInquiryFields\(\)/);
  assert.match(html,/async function loadAllStageHistory\(\)/);
  assert.match(html,/const \{ data, error \} = await loadAllDashboardInquiries\(\)/);
  assert.match(html,/const \{ data: history, error: historyError \} = await loadAllStageHistory\(\)/);
});

test('today workbench paginates follow-ups, mail and reply reminders',()=>{
  assert.match(html,/async function loadAllDashboardFollowups\(\)/);
  assert.match(html,/async function loadAllDashboardEmailMessages\(\)/);
  assert.match(html,/async function loadAllDashboardReplyReminders\(\)/);
  assert.match(html,/loadAllDashboardFollowups\(\)/);
  assert.match(html,/loadAllDashboardEmailMessages\(\)/);
  assert.match(html,/loadAllDashboardReplyReminders\(\)/);
});

test('pending quotation queue is actionable',()=>{
  assert.match(html,/pendingQuote=open\.filter/);
  assert.match(html,/label:"创建报价"/);
  assert.match(html,/data-open-sales-work/);
});

test('sales workbench queue cards open the matching operational module',()=>{
  assert.match(html,/workbenchDestinations=\{"客户新回复":"mailbox","今日待跟进":"follow-calendar","逾期任务":"follow-calendar","待报价":"quotes"\}/);
});

test('dashboard widgets support per-user collapse state and remain expandable',()=>{
  assert.match(html,/dashboard-widget-collapsed/);
  assert.match(html,/wonly_dashboard_collapsed_/);
  assert.match(html,/setDashboardWidgetCollapsed\(widget/);
  assert.match(html,/aria-expanded/);
  assert.match(html,/const keepOpen=new Set\(\["sales-tasks","manager-tasks","core-kpis"\]\)/);
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

test('manager reassignment keeps the UI role-gated and avoids legacy Feishu copy',()=>{
  assert.match(html,/const canAssign = \["owner", "sales_manager"\]\.includes\(profile\.role\)/);
  assert.match(html,/assign_inquiry_to_sales/);
  assert.match(html,/转移询盘负责人/);
  assert.doesNotMatch(html,/已配置的飞书\/钉钉群/);
});
