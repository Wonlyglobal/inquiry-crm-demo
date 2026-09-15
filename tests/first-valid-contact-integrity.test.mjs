import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915193000_protect_first_valid_contact_evidence.sql',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../supabase/migrations/20260910050000_followup_priority_reminders_rollover.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-first-valid-contact-rollback.sql',import.meta.url),'utf8');

test('first valid contact is immutable and requires same-transaction follow-up evidence',()=>{
  assert.match(sql,/create or replace function private\.enforce_first_valid_contact_evidence/);
  assert.match(sql,/old\.first_valid_contact_at is not null[\s\S]*不能清空或改写/);
  assert.match(sql,/current_setting\('app\.inquiry_workflow_rpc',true\)/);
  assert.match(sql,/f\.is_first_valid_contact=true/);
  assert.match(sql,/f\.author_id=new\.updated_by/);
  assert.match(sql,/abs\(extract\(epoch from \(f\.created_at-new\.first_valid_contact_at\)\)\)<=5/);
  assert.match(sql,/revoke all on function private\.enforce_first_valid_contact_evidence\(\) from public,anon,authenticated/);
});

test('the authorized follow-up workflow creates evidence before setting the KPI timestamp',()=>{
  const inserted=workflow.indexOf('insert into public.follow_ups');
  const workflowFlag=workflow.indexOf("set_config('app.inquiry_workflow_rpc','on',true)");
  const updated=workflow.indexOf('first_valid_contact_at=case when mark_first_valid_contact');
  assert.ok(inserted>=0&&workflowFlag>inserted&&updated>workflowFlag);
});

test('production first-contact acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/DIRECT_FIRST_CONTACT_NOT_BLOCKED/);
  assert.match(rollbackSql,/record_inquiry_followup_v2/);
  assert.match(rollbackSql,/is_first_valid_contact=true/);
  assert.match(rollbackSql,/^rollback;/m);
});
