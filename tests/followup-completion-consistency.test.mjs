import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sql=await readFile(new URL('../supabase/migrations/20260910184500_complete_followup_consistency.sql',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('completing a follow-up refreshes the inquiry next action atomically',()=>{
  assert.match(sql,/select min\(f\.next_follow_up_at\) into next_open_due/);
  assert.match(sql,/set next_follow_up_at = next_open_due/);
  assert.match(sql,/task\.author_id <> auth\.uid\(\).*current_crm_role\(\) not in \('owner','sales_manager'\)/s);
  assert.match(sql,/task_completed/);
});

test('follow-up calendar exposes a direct completion action',()=>{
  assert.match(html,/label:"完成任务",onClick:\(\)=>completeFollowUpFromCalendar\(x\)/);
  assert.match(html,/await loadModule\("follow-calendar"\)/);
});

test('daily plans persist separately with owner-scoped permissions and auditable results',()=>{
  assert.match(sql,/create table if not exists public\.sales_daily_plans/);
  assert.match(sql,/owner_id=auth\.uid\(\)/);
  assert.match(sql,/create or replace function public\.create_sales_daily_plan/);
  assert.match(sql,/create or replace function public\.save_sales_daily_plan_result/);
  assert.match(sql,/daily_plan_completed/);
});

test('calendar can create plans, record key results and invoke the intelligent daily report',()=>{
  assert.match(html,/\+ 新增每日计划/);
  assert.match(html,/label:x\.completed_at\?"修改成果":"填写成果"/);
  assert.match(html,/functions\.invoke\("daily-report-ai"/);
  assert.match(html,/一键生成日报/);
});

test('daily report AI is grounded in persisted plans and follow-up records',async()=>{
  const fn=await readFile(new URL('../supabase/functions/daily-report-ai/index.ts',import.meta.url),'utf8');
  assert.match(fn,/from\("sales_daily_plans"\)/);
  assert.match(fn,/from\("follow_ups"\)/);
  assert.match(fn,/profile\.role!=="sales"/);
  assert.match(fn,/不得编造客户回复、结果、金额或承诺/);
});
