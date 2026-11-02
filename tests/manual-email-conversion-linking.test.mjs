import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260917090000_link_manual_email_conversion_messages.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('manual conversion links only exact Message-ID copies without stealing conflicting links',()=>{
  assert.match(migration,/nullif\(btrim\(em\.message_id\),''\)=btrim\(intake\.message_id\)/);
  assert.match(migration,/em\.inquiry_id is null or em\.inquiry_id=target_inquiry_id/);
  assert.match(migration,/association_status='matched'/);
  assert.match(migration,/association_method='manual_intake_conversion'/);
});

test('duplicate mailbox copies derive one canonical inbound communication record',()=>{
  assert.match(migration,/case when em\.direction='inbound' then 0 else 1 end/);
  assert.match(migration,/limit 1/);
  assert.match(migration,/record_synced_email_followup\(canonical_message\.id\)/);
  assert.match(migration,/source_message_id=canonical_message\.id/);
});

test('conversion links messages for both existing and newly created inquiries',()=>{
  assert.match(migration,/link_email_intake_messages\(intake\.id,intake\.inquiry_id\)/);
  assert.match(migration,/link_email_intake_messages\(intake\.id,new_inquiry_id\)/);
  assert.match(migration,/where e\.inquiry_id is not null[\s\S]*link_email_intake_messages\(intake_row\.id,intake_row\.inquiry_id\)/);
});

test('conversion keeps private email AI blocked and relies on in-transaction basic extraction',()=>{
  const start=html.indexOf('async function convertEmailIntakes('),end=html.indexOf('\n      ',start);
  const flow=html.slice(start,end);assert.match(flow,/convert_email_intakes_to_inquiries/);assert.doesNotMatch(flow,/email-communication-ai/);
  assert.match(html,/extract_inquiry_email_needs/);
});
