import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915223000_secure_email_read_receipts.sql',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('./production-email-read-receipt-rollback.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('email read receipts can only be written through the authorized server workflow',()=>{
  assert.match(sql,/revoke insert,update on public\.email_message_reads from authenticated/);
  assert.match(sql,/create or replace function public\.mark_email_message_read/);
  assert.match(sql,/无权查看该邮件/);
  assert.match(sql,/mc\.id=item\.mailbox_connection_id and mc\.user_id=actor_id/);
});

test('opening an inbound mailbox message uses the secure receipt RPC',()=>{
  assert.match(html,/supabase\.rpc\("mark_email_message_read",\{target_message_id:message\.id\}\)/);
  assert.doesNotMatch(html,/from\("email_message_reads"\)\.upsert/);
});

test('production email read receipt acceptance check is rollback-only',()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/EMAIL_READ_RECEIPT_NOT_RECORDED/);
  assert.match(rollback,/^rollback;/m);
});
