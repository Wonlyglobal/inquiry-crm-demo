import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sql=await readFile(new URL('../supabase/migrations/20260916000000_lock_followups_to_workflows.sql',import.meta.url),'utf8');
const rollback=await readFile(new URL('./production-followup-workflow-rollback.sql',import.meta.url),'utf8');

test('interactive follow-up writes are limited to active-role audited workflows',()=>{
  assert.match(sql,/revoke insert,update,delete on public\.follow_ups from authenticated/);
  assert.match(sql,/drop policy if exists follow_ups_insert/);
  assert.match(sql,/where p\.id=actor and p\.active=true/g);
  assert.match(sql,/record_inquiry_followup_v2/);
  assert.match(sql,/complete_follow_up_task/);
  assert.match(sql,/task_created/);
  assert.match(sql,/task_completed/);
  assert.match(sql,/grant execute on function public\.record_inquiry_followup_v2[\s\S]*to authenticated/);
});

test('production follow-up acceptance is isolated and rollback-only',()=>{
  assert.match(rollback,/begin;/);
  assert.match(rollback,/set local role authenticated/);
  assert.match(rollback,/record_inquiry_followup_v2/);
  assert.match(rollback,/complete_follow_up_task/);
  assert.match(rollback,/direct insert unexpectedly succeeded/);
  assert.match(rollback,/direct update unexpectedly succeeded/);
  assert.match(rollback,/rollback;/);
  assert.match(rollback,/rollback_followups/);
});
