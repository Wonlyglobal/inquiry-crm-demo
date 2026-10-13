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

test('follow-up calendar is now an aggregate mailbox activity view',()=>{
  const start=html.indexOf('} else if(view==="follow-calendar")');
  const branch=html.slice(start,html.indexOf('} else if (["inquiries"',start));
  assert.match(branch,/get_sales_email_activity_metrics/);
  assert.match(branch,/"阿里邮箱收件","阿里邮箱发件"/);
  assert.doesNotMatch(branch,/completeFollowUpFromCalendar/);
});

test('daily plans persist separately with owner-scoped permissions and auditable results',()=>{
  assert.match(sql,/create table if not exists public\.sales_daily_plans/);
  assert.match(sql,/owner_id=auth\.uid\(\)/);
  assert.match(sql,/create or replace function public\.create_sales_daily_plan/);
  assert.match(sql,/create or replace function public\.save_sales_daily_plan_result/);
  assert.match(sql,/daily_plan_completed/);
});

test('daily plan history and intelligent daily report remain available outside the mailbox calendar',()=>{
  assert.match(html,/create_sales_daily_plan/);
  assert.match(html,/save_sales_daily_plan_result/);
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
