// Isolated database only: no network or production writes.
const {PGlite}=await import(process.env.CRM_PGLITE_MODULE || '@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const bank=JSON.parse(await read('data/sales360-questionnaire-v2.json'));
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key,role text,active boolean,team text,full_name text,is_test_data boolean default false,data_environment text default 'production');
create function private.sales360_can_evaluate(a uuid,b uuid) returns boolean language sql as $$select exists(select 1 from public.profiles x,public.profiles y where x.id=a and y.id=b and x.active and y.active and x.role='sales_manager' and x.team=y.team)$$;`);
const foundation=await read('supabase/migrations/20260918110000_sales_360_score_foundation.sql');
await db.exec(foundation.slice(foundation.indexOf('create table'),foundation.indexOf('alter table public.sales_360_cycles')));
await db.exec(foundation.slice(foundation.indexOf('create or replace function private.sales_360_dimensions'),foundation.indexOf('create or replace function public.create_sales_360_cycle')));
const existing=await read('supabase/migrations/20260922093000_sales360_start_and_evaluator_scope.sql');
await db.exec(existing.slice(existing.indexOf('CREATE OR REPLACE FUNCTION public.submit_sales_360_evaluation('),existing.indexOf('-- User confirmed 2026-09-22')));
// Install actual production-version definition, so the guard is exercised.
const migration=await read('supabase/migrations/20260922110000_sales360_behavior_questionnaire.sql');
await db.exec(migration);
assert.deepEqual((await db.query('select private.sales360_questionnaire_v2() as x')).rows[0].x,bank);
const make=group=>({version:bank.version,choices:Object.fromEntries(bank.groups[group].map(q=>[q.id,{value:3,evidence:''}])),short_answers:{strength:'本月完成约定交接并反馈实际结果',improvement:'应进一步补齐技术需求并明确跟进时间',action:'下月月底前复盘三次跟进并检查记录完整性',support:'暂无'}});
const validate=(group,payload)=>db.query('select private.validate_sales360_questionnaire($1,$2) as x',[group,payload]);
for(const group of Object.keys(bank.groups)){
 const payload=make(group);
 assert.equal(Object.values((await validate(group,payload)).rows[0].x.scores).every(v=>v===3),true);
 for(const dimension of new Set(bank.groups[group].map(q=>q.dimension))){
  const qs=bank.groups[group].filter(q=>q.dimension===dimension);
  payload.choices[qs[0].id].value='na';payload.choices[qs[1].id].value=4;
 }
 assert.equal(Object.values((await validate(group,payload)).rows[0].x.scores).every(v=>v===3.5),true);
}
let p=make('manager');p.choices.execution_1.value=5;
await assert.rejects(()=>validate('manager',p),/逐题事例/);
p.choices.execution_1.evidence='本月提前完成技术交接并解决客户异议';
assert.equal((await validate('manager',p)).rows[0].x.scores.execution,3.67);
p.choices.execution_1.value='na';p.choices.execution_2.value='na';
await assert.rejects(()=>validate('manager',p),/至少需要2题/);
for(const value of [0,6,3.5,'3',null]){p=make('manager');p.choices.execution_1.value=value;await assert.rejects(()=>validate('manager',p));}
for(const change of [p=>delete p.choices.execution_1,p=>p.choices.fake={value:3},p=>p.short_answers.strength='少',p=>p.short_answers.action=Array(1100).fill('长').join(''),p=>p.version='fake',p=>p.short_answers.action={x:'bad'},p=>p.short_answers.fake='bad']){p=make('manager');change(p);await assert.rejects(()=>validate('manager',p));}
await assert.rejects(()=>validate('manager',null));
const manager='00000000-0000-4000-8000-000000000001',sales='00000000-0000-4000-8000-000000000002',outsider='00000000-0000-4000-8000-000000000003';
await db.query("insert into profiles(id,role,active,team) values($1,'sales_manager',true,'a'),($2,'sales',true,'a'),($3,'sales_manager',true,'b')",[manager,sales,outsider]);
const cycle=(await db.query("insert into sales_360_cycles(period_start,period_end,evaluation_due_at,created_by) values('2026-07-01','2026-07-31',now()+interval '1 day',$1) returning id",[manager])).rows[0].id;
const result=(await db.query('insert into sales_360_results(cycle_id,sales_id) values($1,$2) returning id',[cycle,sales])).rows[0].id;
const task=(await db.query("insert into sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at) values($1,$2,$3,$4,'manager',now()+interval '1 day') returning id",[cycle,result,sales,manager])).rows[0].id;
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
const submit=payload=>db.query('select submit_sales_360_evaluation($1,$2,null,null) as x',[task,payload]);
for(const id of [null,outsider,sales]){await actor(id);await assert.rejects(()=>submit({_questionnaire:make('manager')}),/不属于/)}
await actor(manager);
await assert.rejects(()=>submit({execution:3,professionalism:3,goal_delivery:3,growth:3}),/完整360问卷/);
p=make('manager');p.choices.execution_1.value=4;
const submitted=(await submit({_questionnaire:p,execution:5})).rows[0].x;
assert.equal(submitted.overall_score,3.08); // computed server-side, ignores forged dimension score
const saved=(await db.query('select * from sales_360_evaluation_responses')).rows[0];
assert.equal(saved.questionnaire_version,bank.version);assert.deepEqual(saved.questionnaire_answers,p);assert.equal(saved.dimension_scores.execution,3.33);
await assert.rejects(()=>submit({_questionnaire:p}),/截止或完成/);
assert.equal((await db.query('select count(*)::int n from sales_360_evaluation_responses')).rows[0].n,1);
assert.equal((await db.query("select has_function_privilege('anon','private.validate_sales360_questionnaire(text,jsonb)','EXECUTE') as ok")).rows[0].ok,false);
// Verify new raw answers inherit the exact original own-response RLS.
await db.exec(`alter table sales_360_evaluation_assignments enable row level security;alter table sales_360_evaluation_responses enable row level security;
grant usage on schema public,auth to authenticated;grant select on sales_360_evaluation_assignments,sales_360_evaluation_responses to authenticated;`);
await db.exec(foundation.slice(foundation.indexOf('drop policy if exists sales_360_assignments_read'),foundation.indexOf('drop policy if exists sales_360_appeals_read')));
await db.exec('set role authenticated');
await actor(manager);assert.equal((await db.query('select questionnaire_answers from sales_360_evaluation_responses')).rows.length,1);
for(const id of [sales,outsider]){await actor(id);assert.equal((await db.query('select questionnaire_answers from sales_360_evaluation_responses')).rows.length,0);}
await db.exec('reset role');
console.log('Questionnaire PostgreSQL passed: all five groups, averages, N/A coverage, per-item evidence, essays, forged inputs, authorization, immutable submission and version snapshot.');
await db.close();
