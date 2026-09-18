import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260918110000_sales_360_score_foundation.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('360 foundation separates cycles results anonymous assignments responses and appeals',()=>{
  for(const table of ['sales_360_cycles','sales_360_results','sales_360_goals','sales_360_evaluation_assignments','sales_360_evaluation_responses','sales_360_appeals','sales_360_calibrations','sales_360_events']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test('anonymous evaluator identity is never exposed through the workspace payload',()=>{
  const workspace=sql.slice(sql.indexOf('create or replace function public.get_my_sales_360_workspace'));
  assert.doesNotMatch(workspace,/evaluator_id['"]/);
  assert.match(workspace,/where a\.evaluator_id=actor/);
  assert.match(sql,/sales_360_assignments_read[\s\S]+evaluator_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/sales_360_responses_read[\s\S]+a\.evaluator_id=\(select auth\.uid\(\)\)/);
});

test('360 writes are workflow only and cycle creation is owner only',()=>{
  assert.match(sql,/revoke all on public\.sales_360_cycles[\s\S]+from anon,authenticated/);
  assert.match(sql,/if actor_role<>'owner' then raise exception '仅老板可以创建 360 评分周期'/);
  assert.match(sql,/只能为已经结束的月份创建评分周期/);
  assert.match(sql,/shadow_mode boolean not null default true/);
  assert.match(sql,/if not exists\(select 1 from public\.sales_360_cycles\) then shadow_run:=true/);
  assert.match(sql,/clock_timestamp\(\)\+interval '5 days'/);
});

test('extreme anonymous scores require evidence and every response is immutable',()=>{
  assert.match(sql,/if score_value in \(1,2,5\) then extreme:=true/);
  assert.match(sql,/必须填写具体事实依据/);
  assert.match(sql,/assignment_id uuid not null unique/);
  assert.doesNotMatch(sql,/update public\.sales_360_evaluation_responses/);
  assert.match(sql,/values\(task\.cycle_id,task\.result_id,null,'evaluation_submitted'/);
});

test('appeals are self-only time-bound and append audited events',()=>{
  assert.match(sql,/item\.sales_id<>actor then raise exception '只能申诉本人的评分结果'/);
  assert.match(sql,/cycle\.appeal_due_at is null or clock_timestamp\(\)>cycle\.appeal_due_at/);
  assert.match(sql,/event_type[\s\S]+appeal_submitted/);
});

test('owner calculation produces server-side objective and anonymous weighted scores',()=>{
  assert.match(sql,/create or replace function public\.calculate_sales_360_cycle/);
  assert.match(sql,/仅老板可以计算评分周期/);
  assert.match(sql,/objective_without_relative/);
  assert.match(sql,/manager_weight:=14\+\(case when peer_count<3 then 6 else 0 end\)\+\(case when marketing_count<3 then 5 else 0 end\)/);
  assert.match(sql,/grade=case when total_score>=90 then 'S'/);
  assert.match(sql,/bonus_multiplier=case when total_score>=90 then 1\.5/);
});

test('only the owner can lock results and every release opens an appeal window',()=>{
  assert.match(sql,/create or replace function public\.lock_sales_360_cycle/);
  assert.match(sql,/仅老板可以锁定并发布评分/);
  assert.match(sql,/clock_timestamp\(\)\+interval '3 days'/);
  assert.match(sql,/cycle_locked/);
  assert.match(sql,/仍有主管校准建议待老板审核，不能锁定发布/);
  assert.match(html,/calculate_sales_360_cycle/);
  assert.match(html,/lock_sales_360_cycle/);
});

test('manager calibration suggestions require evidence and owner approval',()=>{
  assert.match(sql,/create or replace function public\.submit_sales_360_calibration/);
  assert.match(sql,/仅直属销售主管可以提交校准建议/);
  assert.match(sql,/只能校准本团队业务员/);
  assert.match(sql,/校准建议必须在原总分上下 10 分以内/);
  assert.match(sql,/create or replace function public\.review_sales_360_calibration/);
  assert.match(sql,/仅老板可以审核校准建议/);
  assert.match(sql,/calibration_(approved|rejected)/);
  assert.match(html,/submit_sales_360_calibration/);
  assert.match(html,/review_sales_360_calibration/);
});

test('appeals enforce manager first review and owner final review',()=>{
  assert.match(sql,/create or replace function public\.review_sales_360_appeal/);
  assert.match(sql,/该申诉不在主管初审阶段/);
  assert.match(sql,/该申诉尚未完成主管初审或已经处理/);
  assert.match(sql,/累计调整不得超过原始分数上下 10 分/);
  assert.match(sql,/appeal_manager_reviewed/);
  assert.match(sql,/appeal_owner_reviewed/);
  assert.match(html,/review_sales_360_appeal/);
  for(const label of ['待主管初审','待老板终审','终审申诉'])assert.match(html,new RegExp(label));
});

test('frontend exposes a role-aware 360 workspace',()=>{
  assert.match(html,/data-view="performance-360"/);
  assert.match(html,/get_my_sales_360_workspace/);
  assert.match(html,/submit_sales_360_evaluation/);
  assert.match(html,/set_sales_360_goal/);
  assert.match(html,/submit_sales_360_appeal/);
  for(const label of ['全公司管理','本团队管理','本人评分与申诉','匿名协作评价'])assert.match(html,new RegExp(label));
});

test('read-only marketing can only use the two scoped 360 RPCs needed for evaluation',()=>{
  assert.match(sql,/grant execute on function public\.submit_sales_360_evaluation\(uuid,jsonb,text,text\) to crm_marketing_readonly/);
  assert.match(sql,/grant execute on function public\.get_my_sales_360_workspace\(\) to crm_marketing_readonly/);
  assert.match(html,/\/rest\/v1\/rpc\/get_my_sales_360_workspace/);
  assert.match(html,/\/rest\/v1\/rpc\/submit_sales_360_evaluation/);
  assert.match(html,/forgot-password-form,#sales360-evaluation-form/);
});
