import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync(new URL('../supabase/functions/email-communication-ai/index.ts',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../mail-sync/src/index.mjs',import.meta.url),'utf8');

test('follow-up summaries remain append-only versions',()=>{
  assert.doesNotMatch(edge,/communication_summaries"\)\.delete/);
  assert.match(edge,/generation_trigger:generationTrigger/);
  assert.match(html,/查看历史总结/);
  assert.match(html,/summaryHistory\.map/);
});

test('generation origin is retained for sync, automatic and manual updates',()=>{
  assert.match(sync,/trigger:'mail_sync'/);
  assert.match(html,/automatic\?"automatic_refresh":"manual"/);
  assert.match(html,/邮件同步自动生成/);
});

test('legacy inquiries fall back to their original email intake',()=>{
  assert.match(edge,/from\("email_intake"\)/);
  assert.match(edge,/source_message_id:sourceMessageId\|\|null/);
  assert.match(html,/error\.context\.json/);
});
