import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260915200000_record_synced_email_contact_evidence.sql',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../mail-sync/src/index.mjs',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-synced-email-contact-rollback.sql',import.meta.url),'utf8');

test('mail sync records communication through a service-only atomic workflow',()=>{
  assert.match(migration,/create or replace function public\.record_synced_email_followup/);
  assert.match(migration,/for update/);
  assert.match(migration,/insert into public\.follow_ups[\s\S]*is_first_valid_contact/);
  assert.match(migration,/set_config\('app\.inquiry_workflow_rpc','on',true\)/);
  assert.match(migration,/update public\.inquiries set[\s\S]*first_valid_contact_at=occurred_at/);
  assert.match(migration,/revoke all on function public\.record_synced_email_followup\(uuid\) from public,anon,authenticated/);
  assert.match(migration,/grant execute on function public\.record_synced_email_followup\(uuid\) to service_role/);
});

test('production email contact acceptance check is idempotent and rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/record_synced_email_followup\(message_id\)/);
  assert.match(rollbackSql,/EMAIL_FOLLOWUP_NOT_IDEMPOTENT/);
  assert.match(rollbackSql,/EMAIL_CONTACT_EVIDENCE_INCOMPLETE/);
  assert.match(rollbackSql,/^rollback;/m);
});

test('only a real owner sent message after assignment can close first-response KPI',()=>{
  assert.match(migration,/message_row\.direction='outbound'/);
  assert.match(migration,/inquiry_row\.owner_id=actor_id/);
  assert.match(migration,/occurred_at>=inquiry_row\.assigned_at/);
  assert.match(migration,/inquiry_row\.validity='valid'/);
  assert.match(worker,/db\.rpc\('record_synced_email_followup',\{target_email_message_id:row\.id\}\)/);
  assert.doesNotMatch(worker,/from\('inquiries'\)\.update\(\{first_valid_contact_at/);
});
