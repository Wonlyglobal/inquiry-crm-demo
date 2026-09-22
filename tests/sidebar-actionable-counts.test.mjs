import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20260922130000_sidebar_actionable_counts.sql',import.meta.url),'utf8');

test('mailbox count uses personal inbound messages minus the current users read receipts',()=>{
  assert.match(sql,/mc\.user_id=actor_id/);
  assert.match(sql,/mc\.mailbox_kind='personal'/);
  assert.match(sql,/m\.direction='inbound'/);
  assert.match(sql,/r\.email_message_id=m\.id and r\.user_id=actor_id/);
});

test('today work count is composed from unique actionable records instead of notification history',()=>{
  for(const source of ['email_reply_reminders','whatsapp_reply_reminders','follow_ups','quotation_versions','data_quality_alerts'])assert.match(sql,new RegExp(`public\\.${source}`));
  assert.match(sql,/select count\(\*\)::integer into today_tasks from actionable/);
  assert.doesNotMatch(sql,/from public\.notifications/);
});

test('count function is authenticated, scoped to the actor and does not expose message content',()=>{
  assert.match(sql,/actor_id uuid:=auth\.uid\(\)/);
  assert.match(sql,/security definer/);
  assert.match(sql,/revoke all on function public\.get_my_sidebar_actionable_counts\(\) from public,anon/);
  assert.doesNotMatch(sql,/body_text|body_html|subject/);
});
