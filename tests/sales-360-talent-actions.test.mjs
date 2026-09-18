import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260918120000_sales_360_reminders_and_talent_actions.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('evaluation reminders are durable idempotent and independent of page visits',()=>{
  assert.match(sql,/create or replace function private\.process_sales_360_evaluation_reminders/);
  assert.match(sql,/a\.status='pending' and c\.status='collecting'/);
  assert.match(sql,/interval '2 days'/);
  assert.match(sql,/interval '24 hours'/);
  assert.match(sql,/sales_360_evaluation_due_2d/);
  assert.match(sql,/sales_360_evaluation_due_today/);
  assert.match(sql,/not exists\([\s\S]+n\.recipient_id=d\.evaluator_id[\s\S]+d\.id::text/);
  assert.match(sql,/cron\.schedule\('notify-sales-360-evaluations-hourly','27 \* \* \* \*'/);
});

test('talent suggestions use fixed evidence rules and protect new hires',()=>{
  assert.match(sql,/create table if not exists public\.sales_360_talent_recommendations/);
  assert.match(sql,/private\.refresh_sales_360_talent_recommendation/);
  assert.match(sql,/item\.new_hire_protected and item\.grade in \('C','D'\)/);
  assert.match(sql,/recent_d_count=2 or current_quarter_d_count>=2/);
  assert.match(sql,/recent_c_count=2/);
  assert.match(sql,/qualifying_quarters=2/);
  assert.match(sql,/quarter_result\.average_score>=85 and quarter_result\.month_count=3/);
  assert.match(sql,/minimum_sample_met/);
  assert.match(sql,/first_response_total/);
  assert.match(sql,/data_completeness/);
  assert.match(sql,/old\.state in \('locked','appeal','adjusted','closed'\) then[\s\S]+return new/);
});

test('talent suggestions cannot execute personnel decisions automatically',()=>{
  assert.match(sql,/Suggestions never perform promotion, elimination or bonus changes automatically/);
  assert.match(sql,/仅老板可以确认或驳回人才建议/);
  assert.match(sql,/shadow_only boolean not null default true/);
  assert.match(sql,/status text not null default 'pending'/);
  assert.doesNotMatch(sql,/update public\.profiles[\s\S]+action_type/);
  assert.doesNotMatch(sql,/delete from public\.profiles/);
  assert.match(sql,/talent_recommendation_reviewed/);
});

test('role visibility hides personnel suggestions from marketing and limits sales to own development items',()=>{
  assert.match(sql,/if actor_profile\.role='marketing' then return '\[\]'::jsonb/);
  assert.match(sql,/actor_profile\.role='sales_manager' and actor_profile\.team is not distinct from s\.team/);
  assert.match(sql,/actor_profile\.role='sales' and r\.sales_id=actor and t\.action_type in \('recognition','training','coaching','no_action'\)/);
  assert.match(html,/get_my_sales_360_talent_recommendations/);
  assert.match(html,/review_sales_360_talent_recommendation/);
  for(const label of ['培训改进','重点辅导','淘汰观察','晋升候选','影子建议'])assert.match(html,new RegExp(label));
});

test('browser roles cannot directly write talent recommendations',()=>{
  assert.match(sql,/revoke all on public\.sales_360_talent_recommendations from anon,authenticated/);
  assert.match(sql,/grant select on public\.sales_360_talent_recommendations to authenticated/);
  assert.match(sql,/revoke all on function private\.refresh_sales_360_talent_recommendation\(uuid\) from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.review_sales_360_talent_recommendation\(uuid,boolean,text\) to authenticated/);
});
