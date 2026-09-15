import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../mail-sync/src/index.mjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260915090000_scheduled_quotation_delivery.sql',import.meta.url),'utf8');

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

test('ambiguous deliveries are surfaced for review instead of retried',()=>{
  assert.match(worker,/function recoverStaleOutboxJobs/);
  assert.match(worker,/eq\('status','sending'\)\.lte\('started_at',cutoff\)/);
  assert.match(worker,/为避免重复邮件不会自动重试/);
  assert.match(worker,/mailbox_scheduled_message_delivery_uncertain/);
  assert.match(worker,/automatic_retry:false/);
  assert.match(worker,/await recoverStaleOutboxJobs\(\)/);
});

test('scheduled quotation delivery persists and finalizes the approved quotation workflow',()=>{
  assert.match(html,/target_quotation_id:\$\("#mail-compose-quotation"\)\.value\|\|null/);
  assert.match(migration,/add column if not exists quotation_id uuid references public\.quotation_versions/);
  assert.match(migration,/quote\.status<>'approved'/);
  assert.match(migration,/function public\.finalize_scheduled_quotation/);
  assert.match(migration,/grant execute on function public\.finalize_scheduled_quotation\(uuid,timestamptz\) to service_role/);
  assert.match(worker,/quote\.status!=='approved'/);
  assert.match(worker,/db\.rpc\('finalize_scheduled_quotation'/);
});
