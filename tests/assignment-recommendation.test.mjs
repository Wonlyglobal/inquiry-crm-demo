import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../supabase/functions/assignment-recommendation/index.ts',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');

test('assignment recommendations are manager-only and never perform assignment',()=>{
  assert.match(worker,/\["owner","sales_manager"\]\.includes\(profile\.role\)/);
  assert.match(worker,/仅可为有效且待分配的询盘生成推荐/);
  assert.doesNotMatch(worker,/assign_inquiry_to_sales/);
  assert.match(worker,/guardrail:"仅供主管参考，不自动分配"/);
});

test('assignment scoring is explainable and uses the required operational evidence',()=>{
  for(const key of ['country','product','capacity','sla','continuity'])assert.match(worker,new RegExp(`${key}:\\{score:`));
  assert.match(worker,/pendingReplies/);
  assert.match(worker,/30 分钟首响/);
  assert.match(worker,/recommendations:top/);
  assert.match(worker,/assignment-territory-v2/);
});

test('recommendations use the generic audited suggestion workflow',()=>{
  assert.match(worker,/record_ai_suggestion/);
  assert.match(worker,/suggestion_type","assignment_recommendation/);
  assert.match(html,/review_ai_suggestion/);
  assert.match(html,/target_decision:decision/);
});

test('assignment modal shows top candidates but leaves confirmation in the existing workflow',()=>{
  assert.match(html,/智能分配推荐/);
  assert.match(html,/label:"智能分配",onClick:\(\)=>openDirectAssignment\(x\.id\)/);
  assert.match(html,/data-assignment-candidate/);
  assert.match(html,/确认分配前仍可修改/);
  assert.match(html,/failed to send a request[\s\S]*assignment-recommendation/);
  assert.match(html,/assign_inquiry_to_sales/);
  assert.match(config,/\[functions\.assignment-recommendation\][\s\S]*verify_jwt = false/);
});
