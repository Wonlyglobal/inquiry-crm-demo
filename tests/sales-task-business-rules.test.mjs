import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20260922153000_customer_reply_task_rules.sql',import.meta.url),'utf8');

test('sales task center exposes only manager assignments and genuine customer replies',()=>{
  const branch=html.slice(html.indexOf('} else if(view==="sales-today")'),html.indexOf('} else if(view==="knowledge")'));
  assert.match(html,/const categories=\[\["all","全部任务"\],\["assigned","主管分配询盘"\],\["reply","客户新回复"\]\]/);
  assert.doesNotMatch(branch,/from\("follow_ups"\)/);
  assert.doesNotMatch(branch,/from\("quotation_versions"\)/);
  assert.doesNotMatch(branch,/from\("data_quality_alerts"\)/);
  assert.match(branch,/x\.assigned_at&&!x\.first_valid_contact_at/);
  assert.match(branch,/replyRemindersResult\.data/);
});

test('email reply reminder requires customer identity or a reply to outbound CRM mail',()=>{
  assert.match(sql,/is_genuine_customer_email_reply/);
  assert.match(sql,/c\.id=i\.contact_id or c\.company_id=i\.company_id/);
  assert.match(sql,/e\.inquiry_id=i\.id/);
  assert.match(sql,/m\.in_reply_to=outbound\.message_id/);
  assert.match(sql,/auto-submitted/);
  assert.match(sql,/no-\?reply\|do-\?not-\?reply\|mailer-daemon\|postmaster/);
});

test('existing false-positive reminders are dismissed rather than deleted',()=>{
  assert.match(sql,/update public\.email_reply_reminders r[\s\S]*set status='dismissed'/);
  assert.doesNotMatch(sql,/delete from public\.email_reply_reminders/);
  assert.match(sql,/revoke all on function private\.is_genuine_customer_email_reply\(uuid,uuid\) from public,anon,authenticated/);
});
