import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260910180000_automatic_followup_rollover.sql',import.meta.url),'utf8');

test('unfinished follow-ups roll over without requiring a page visit',()=>{
  assert.match(sql,/create or replace function private\.process_follow_up_schedule/);
  assert.match(sql,/for update of f skip locked/);
  assert.match(sql,/i\.status not in \('won','lost'\)/);
  assert.match(sql,/rollover_count=f\.rollover_count\+1/);
  assert.match(sql,/task_rolled_over/);
});

test('due reminders are durable, idempotent and scheduled every five minutes',()=>{
  assert.match(sql,/\[任务:%s\]/);
  assert.match(sql,/n\.body like '\[任务:'\|\|f\.id::text\|\|'\]%'/);
  assert.match(sql,/process-crm-followups-every-5-minutes/);
  assert.match(sql,/'\*\/5 \* \* \* \*'/);
  assert.match(sql,/revoke all on function private\.process_follow_up_schedule\(\) from public,anon,authenticated/);
});
