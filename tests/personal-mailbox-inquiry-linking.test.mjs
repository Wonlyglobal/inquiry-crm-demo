import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260918090000_associate_personal_email_with_inquiry.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('personal mailbox association is restricted to the current users mailbox and visible inquiry',()=>{
  assert.match(migration,/mc\.user_id=actor_id/);
  assert.match(migration,/mc\.mailbox_kind='personal'/);
  assert.match(migration,/i\.owner_id=actor_id or actor_role in \('owner','sales_manager'\)/);
  assert.match(migration,/已关联其他询盘，不能直接改绑/);
});

test('association atomically creates dated communication evidence and audit history',()=>{
  assert.match(migration,/association_method='manual_personal_mailbox'/);
  assert.match(migration,/record_synced_email_followup\(message_row\.id\)/);
  assert.match(migration,/coalesce\(message_row\.sent_at,message_row\.received_at,message_row\.created_at\)/);
  assert.match(migration,/personal_mailbox_message_linked/);
});

test('mailbox detail lets the user link an inquiry and then refreshes the AI summary',()=>{
  assert.match(html,/id="mail-detail-inquiry"/);
  assert.match(html,/associate_personal_email_with_inquiry/);
  assert.match(html,/source_message_id:message\.id,trigger:"manual_mailbox_link"/);
  assert.match(html,/邮件已关联，沟通记录和 AI 总结已按时间生成/);
});

