import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sender=fs.readFileSync(new URL('../supabase/functions/mailbox-send/index.ts',import.meta.url),'utf8');

test('client explicitly distinguishes a customer reply from proactive outreach',()=>{
  assert.match(html,/message_kind: isReply\?"reply":"outreach"/);
});

test('proactive outreach is blocked server-side unless contact policy allows it',()=>{
  assert.match(sender,/\["reply", "outreach"\]\.includes\(requestedMessageKind\)/);
  assert.match(sender,/email_messages"\)\.select\("direction,sender_email"\)/);
  assert.match(sender,/const latestSender = clean\(latestThreadMessage\?\.sender_email, 320\)\.toLowerCase\(\)/);
  assert.match(sender,/latestSender === recipient \? "reply" : "outreach"/);
  assert.match(sender,/messageKind === "outreach"/);
  assert.match(sender,/userClient\.rpc\("check_inquiry_contact_allowed"/);
  assert.match(sender,/status: 409/);
  assert.match(sender,/触达规则拦截/);
});

test('duplicate sent and shared-inbox copies are classified by the verified customer sender',()=>{
  assert.match(sender,/same RFC message can appear as outbound in a salesperson's/);
  assert.doesNotMatch(sender,/latestThreadMessage\.direction === "inbound"/);
});

test('successful outreach advances frequency control and records the outcome',()=>{
  assert.match(sender,/userClient\.rpc\("record_inquiry_marketing_contact"/);
  assert.match(sender,/contact_policy_recorded: policyRecorded/);
  assert.match(sender,/messageKind === "reply" \? "inquiry_reply_email_sent" : "outreach_email_sent"/);
});

test('contact safety remains enforced by the sender without a duplicate detail entry',()=>{
  assert.doesNotMatch(html,/data-detail-tab="contact-policy"/);
  assert.doesNotMatch(html,/id="contact-policy-consent"/);
  assert.doesNotMatch(html,/rpc\("save_inquiry_contact_policy"/);
  assert.match(sender,/rpc\("check_inquiry_contact_allowed"/);
});
