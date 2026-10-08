import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/20261008123000_manual_opportunity_first_contact_due.sql',import.meta.url),'utf8');

test('new opportunities open immediately and start the research-to-draft workflow',()=>{
  const flow=html.slice(html.indexOf('$("#manual-form").addEventListener("submit"'),html.indexOf('      function parseMail('));
  assert.match(flow,/const created=await createInquiry/);
  assert.match(flow,/postCreateAutomationInquiryId=created\.id/);
  assert.match(flow,/await openInquiryDetail\(created\.id\)/);
  assert.match(html,/async function maybeGeneratePostCreateOutreach\(\)/);
  assert.match(html,/await maybeGeneratePostCreateOutreach\(\)/);
  assert.match(html,/await generateOutreach\(\)/);
});

test('automatic outreach remains a human-review draft and blocks missing email or evidence',()=>{
  const start=html.indexOf('      async function maybeGeneratePostCreateOutreach()');
  const end=html.indexOf('      $("#run-business-research").addEventListener',start);
  assert.ok(start>=0&&end>start);
  const flow=html.slice(start,end);
  assert.match(flow,/!quality\.generated/);
  assert.match(flow,/缺少已核验客户邮箱/);
  assert.match(flow,/setDetailTab\("outreach"\)/);
  assert.doesNotMatch(flow,/mailbox-send|send-outreach|\.click\(\)/);
  assert.match(html,/status: "draft"/);
  assert.match(html,/待人工审核/);
});

test('manual owner and marketing creation receives a non-null four-hour SLA without weakening the column',()=>{
  assert.match(sql,/before insert on public\.inquiries/);
  assert.match(sql,/new\.owner_id is null/);
  assert.match(sql,/new\.status='pending_assignment'/);
  assert.match(sql,/new\.last_change_reason='市场\/管理员登记并提交主管分配'/);
  assert.match(sql,/new\.first_contact_due_at:=coalesce\([\s\S]*\)\+interval '4 hours'/);
  assert.doesNotMatch(sql,/drop not null/i);
  assert.match(sql,/revoke all on function private\.ensure_manual_opportunity_first_contact_due\(\) from public,anon,authenticated/);
});
