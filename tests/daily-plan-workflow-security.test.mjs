import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sql=await readFile(new URL('../supabase/migrations/20260915234500_lock_daily_plans_to_workflow.sql',import.meta.url),'utf8');
const rollback=await readFile(new URL('./production-daily-plan-workflow-rollback.sql',import.meta.url),'utf8');

test('daily plans are writable only through audited authenticated workflows',()=>{
  assert.match(sql,/revoke insert,update,delete on public\.sales_daily_plans from authenticated/);
  assert.match(sql,/drop policy if exists sales_daily_plans_insert/);
  assert.match(sql,/drop policy if exists sales_daily_plans_update/);
  assert.match(sql,/where p\.id=actor and p\.active=true/);
  assert.match(sql,/daily_plan_created/);
  assert.match(sql,/daily_plan_completed/);
  assert.match(sql,/grant execute on function public\.create_sales_daily_plan\(date,text,text,timestamptz,uuid\) to authenticated/);
});

test('production daily plan acceptance is isolated and rollback-only',()=>{
  assert.match(rollback,/begin;/);
  assert.match(rollback,/set local role authenticated/);
  assert.match(rollback,/saved:=public\.create_sales_daily_plan/);
  assert.match(rollback,/perform public\.save_sales_daily_plan_result/);
  assert.match(rollback,/direct insert unexpectedly succeeded/);
  assert.match(rollback,/rollback;/);
  assert.match(rollback,/rollback_plans/);
});
