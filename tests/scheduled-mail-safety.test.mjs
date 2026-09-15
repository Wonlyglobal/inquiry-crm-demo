import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../mail-sync/src/index.mjs',import.meta.url),'utf8');

test('scheduled mail revalidates the sender and inquiry assignment at execution time',()=>{
  assert.match(worker,/function validateOutboxSend/);
  assert.match(worker,/select\('id,full_name,role,active'\)/);
  assert.match(worker,/if\(!sender\?\.active\)throw permanentError/);
  assert.match(worker,/inquiry\.owner_id!==job\.sender_user_id/);
  assert.match(worker,/发送人已不再负责该询盘/);
});

test('scheduled follow-up classification uses authoritative thread state and contact policy',()=>{
  assert.match(worker,/email_messages'\)\.select\('direction'\)/);
  assert.match(worker,/const messageKind=!latest\|\|latest\.direction==='inbound'\?'reply':'outreach'/);
  assert.match(worker,/db\.rpc\('check_inquiry_contact_allowed'/);
  assert.match(worker,/触达规则拦截/);
});

test('permanent authorization and suppression failures are not retried',()=>{
  assert.match(worker,/error\.permanent=true/);
  assert.match(worker,/terminal=Boolean\(error\?\.permanent\)\|\|attempts>=3/);
  assert.match(worker,/mailbox_scheduled_message_failed/);
});

test('successful proactive scheduled mail advances contact frequency and is audited',()=>{
  assert.match(worker,/function recordScheduledMarketingContact/);
  assert.match(worker,/inquiry_contact_policies'\)\.update\(\{last_contact_at:sentAt,next_allowed_at:nextAllowedAt/);
  assert.match(worker,/marketing_contact_recorded/);
  assert.match(worker,/mailbox_scheduled_message_sent/);
  assert.match(worker,/contact_policy_recorded:contactPolicyRecorded/);
});
