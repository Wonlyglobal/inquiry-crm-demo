// Isolated database only: no network or production writes.
const {PGlite}=await import(process.env.CRM_PGLITE_MODULE || '@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const bank=JSON.parse(await read('data/sales360-questionnaire-nrs-v3.json'));
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
await db.exec("create type public.crm_role as enum ('owner','sales_manager','sales','marketing')");
await db.exec(foundation.slice(foundation.indexOf('create or replace function public.calculate_sales_360_cycle'),foundation.indexOf('create or replace function public.lock_sales_360_cycle')));
await db.exec(await read('supabase/migrations/20260922123000_sales360_nrs.sql'));
assert.deepEqual((await db.query('select private.sales360_questionnaire_nrs_v3() as x')).rows[0].x,bank);
const make=(group,value=6)=>({version:bank.version,choices:Object.fromEntries(bank.groups[group].map(q=>[q.id,{value,evidence:(value<=4||value>=9)?'本月具体任务表现及结果已核实记录':''}])),short_answers:{strength:'本月完成约定交接并反馈实际结果',improvement:'应进一步补齐技术需求并明确跟进时间',action:'下月月底前复盘三次跟进并检查记录完整性',support:'暂无'}});
const validate=(group,payload)=>db.query('select private.validate_sales360_questionnaire($1,$2) as x',[group,payload]);
for(const group of Object.keys(bank.groups))for(const value of [0,4,5,6,8,9,10])assert.ok(Object.values((await validate(group,make(group,value))).rows[0].x.scores).every(x=>x===value));
for(const value of [-1,11,6.5,'6',null]){const p=make('manager');p.choices.execution_1.value=value;await assert.rejects(()=>validate('manager',p));}
for(const value of [0,1,2,3,4,9,10]){const p=make('manager',value);p.choices.execution_1.evidence='';await assert.rejects(()=>validate('manager',p),/逐题事例/);}
let p=make('manager');p.choices.execution_1.value='na';p.choices.execution_2.value=8;
assert.equal((await validate('manager',p)).rows[0].x.scores.execution,7);
p.choices.execution_2.value='na';await assert.rejects(()=>validate('manager',p),/至少需要2题/);
p=make('manager');p.version='360-behavior-v2';await assert.rejects(()=>validate('manager',p),/刷新/);
const owner='00000000-0000-4000-8000-000000000001',manager='00000000-0000-4000-8000-000000000002',sales='00000000-0000-4000-8000-000000000003';
await db.query("insert into profiles(id,role,active,team) values($1,'owner',true,'a'),($2,'sales_manager',true,'a'),($3,'sales',true,'a')",[owner,manager,sales]);
const cycle=(await db.query("insert into sales_360_cycles(period_start,period_end,evaluation_due_at,created_by) values('2026-07-01','2026-07-31',now()+interval '1 day',$1) returning id",[owner])).rows[0].id;
const result=(await db.query('insert into sales_360_results(cycle_id,sales_id) values($1,$2) returning id',[cycle,sales])).rows[0].id;
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
for(const [group,id] of [['owner',owner],['manager',manager],['self',sales]]){
 const task=(await db.query("insert into sales_360_evaluation_assignments(cycle_id,result_id,subject_id,evaluator_id,evaluator_group,due_at) values($1,$2,$3,$4,$5,now()+interval '1 day') returning id",[cycle,result,sales,id,group])).rows[0].id;
 await actor(null);await assert.rejects(()=>db.query('select submit_sales_360_evaluation($1,$2,null,null)',[task,{_questionnaire:make(group)}]),/不属于/);
 await actor(id);
 const response=(await db.query('select submit_sales_360_evaluation($1,$2,null,null) as x',[task,{_questionnaire:make(group,8)}])).rows[0].x;
 assert.equal(response.overall_score,8);
 await assert.rejects(()=>db.query('select submit_sales_360_evaluation($1,$2,null,null)',[task,{_questionnaire:make(group)}]),/截止或完成/);
}
// Historical /5 response mixed with NRS /10 in one cycle, without mutating historical values during calculation.
await db.query("update sales_360_evaluation_responses set overall_score=4,questionnaire_version='360-behavior-v2',questionnaire_answers=null where assignment_id in(select id from sales_360_evaluation_assignments where evaluator_group='owner')");
await db.query("insert into sales_360_goals(result_id,target_won_amount_cny,monthly_bonus_base,set_by) values($1,10000,1000,$2)",[result,owner]);
await db.exec(`create table inquiries(owner_id uuid,assigned_at timestamptz,created_at timestamptz,status text,won_at timestamptz,won_amount numeric,won_exchange_rate numeric,first_valid_contact_at timestamptz,quoted_at timestamptz,qualification_score numeric,target_country text,product_category text,quantity text,estimated_amount numeric,contact_job_title text,next_follow_up_at timestamptz,excluded_from_dashboard boolean,validity text);
create table follow_ups(author_id uuid,is_task boolean,completion_status text,original_due_at timestamptz,next_follow_up_at timestamptz);
create table email_reply_reminders(owner_id uuid,status text,replied_at timestamptz,received_at timestamptz);`);
await actor(owner);await db.query('select calculate_sales_360_cycle($1)',[cycle]);
let r=(await db.query('select multirater_score from sales_360_results where id=$1',[result])).rows[0];assert.equal(r.multirater_score,'32.00');
assert.equal((await db.query("select overall_score from sales_360_evaluation_responses where questionnaire_version='360-behavior-v2'")).rows[0].overall_score,'4.00');
// Zero is valid NRS (requires evidence at submission), full score is capped by the unchanged 40-point allocation.
for(const [score,expected] of [[0,'0.00'],[10,'40.00']]){
 await db.query("update sales_360_evaluation_responses set questionnaire_version='360-nrs-v3',overall_score=$1",[score]);
 await db.query('select calculate_sales_360_cycle($1)',[cycle]);
 assert.equal((await db.query('select multirater_score from sales_360_results where id=$1',[result])).rows[0].multirater_score,expected);
}
await assert.rejects(()=>db.exec("update sales_360_evaluation_responses set questionnaire_version='legacy-v1',overall_score=10"),/check constraint/);
await db.exec("update sales_360_cycles set status='locked'");await assert.rejects(()=>db.query('select calculate_sales_360_cycle($1)',[cycle]),/不能重新计算/);
console.log('NRS PostgreSQL passed: 0/10 endpoints, all roles, evidence bands, N/A coverage, rejected stale versions, authorization, raw-score persistence, mixed-scale weighting, historical preservation, locked results.');
await db.close();
