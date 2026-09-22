// Offline synthetic PostgreSQL validation. Never connects to Supabase.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.CRM_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function private.reject_risk_event_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;`);
await db.exec(await read('tests/fixtures/manager-scope-schema.sql'));
await db.exec(`alter table profiles add primary key(id);
create function private.current_crm_role() returns public.crm_role language sql stable security definer as $$select role from public.profiles where id=auth.uid() and active$$;
grant usage on schema public,private,auth to authenticated;
grant select on all tables in schema public to authenticated;`);
const foundation=await read('supabase/migrations/20260918110000_sales_360_score_foundation.sql');
await db.exec(foundation.slice(foundation.indexOf('create table'),foundation.indexOf('alter table public.sales_360_cycles')));
await db.exec(foundation.slice(foundation.indexOf('create or replace function private.sales_360_dimensions'),foundation.indexOf('create or replace function public.create_sales_360_cycle')));
await db.exec(`create policy sales_360_results_read on sales_360_results for select to authenticated using(true);`);
const ling='79727b73-5a54-40ff-bd1b-28dcf8d0bb23';
await db.query(`insert into profiles(id,full_name,role,active,team,is_test_data,data_environment) values ($1,'凌子学','sales_manager',true,'销售部',false,'production')`,[ling]);
await db.exec(await read('tests/fixtures/manager-scope-predecessors.sql'));
// Install the actual predecessor functions and exercise every production drift gate.
let migration=await read('supabase/migrations/20260921200000_unified_manager_scope.sql');
const gates=[...migration.matchAll(/if md5\(pg_get_functiondef\('([^']+)'::regprocedure\)\) <> '([a-f0-9]+)'/g)];
assert.equal(gates.length,31);
for(const [,sig] of gates)assert.ok((await db.query('select to_regprocedure($1) as f',[sig])).rows[0].f,sig);

await db.exec(migration);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const a=id(1),b=id(2),other=id(3),test=id(4),owner=id(5),outsider=id(6),nullManager=id(7);
for(const [key,role,team,tested] of [[a,'sales','海外业务部',false],[b,'sales','海外工程部',false],[other,'sales','第三部门',false],[test,'sales','海外业务部',true],[owner,'owner','总部',false],[outsider,'sales_manager','第三部门',false],[nullManager,'sales_manager',null,false]])
 await db.query(`insert into profiles(id,full_name,role,active,team,is_test_data,data_environment) values($1::uuid,$1::text,$2,true,$3,$4,'production')`,[key,role,team,tested]);
const actor=key=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[key||'']);
const covered=async key=>(await db.query('select private.crm_manager_covers_user($1,$2) as ok',[ling,key])).rows[0].ok;
assert.equal(await covered(a),true);assert.equal(await covered(b),true);assert.equal(await covered(other),false);assert.equal(await covered(test),false);
await actor(ling);
const scope=(await db.query('select get_my_management_scope() as scope')).rows[0].scope;
assert.deepEqual(scope.people.map(p=>p.id).sort(),[a,b].sort());
assert.deepEqual(scope.teams,['海外业务部','海外工程部']);
await db.query("update private.crm_manager_teams set active=false where manager_id=$1 and team='海外工程部'",[ling]);
assert.equal(await covered(b),false);
assert.equal((await db.query('select count(*)::int as n from private.crm_manager_team_events')).rows[0].n,3);
await assert.rejects(()=>db.exec('delete from private.crm_manager_team_events'),/immutable/);
await db.query("update private.crm_manager_teams set active=true where manager_id=$1",[ling]);
const ia=id(21),ib=id(22),ic=id(23),pool=id(24),invalid=id(25),testInquiry=id(26);
for(const [key,holder,validity,tested] of [[ia,a,'valid',false],[ib,b,'valid',false],[ic,other,'valid',false],[pool,null,'valid',false],[invalid,null,'invalid',false],[testInquiry,a,'valid',true]])
 await db.query(`insert into inquiries(id,owner_id,validity,is_test_data,excluded_from_dashboard,status) values($1,$2,$3,$4,false,'received')`,[key,holder,validity,tested]);
// Real RLS evaluation, including nested helpers under authenticated (not table owner).
for(const table of ['inquiries','profiles','daily_sales_reports'])await db.exec(`alter table ${table} enable row level security;create policy fixture_read on ${table} for select to authenticated using(true);`);
for(const key of [a,b,other,test])await db.query(`insert into daily_sales_reports(sales_id) values($1)`,[key]);
await db.exec('set role authenticated');
assert.deepEqual((await db.query('select id from inquiries order by id')).rows.map(r=>r.id),[ia,ib,pool]);
assert.deepEqual((await db.query('select sales_id from daily_sales_reports order by sales_id')).rows.map(r=>r.sales_id),[a,b]);
await actor(nullManager);assert.equal((await db.query('select id from inquiries')).rows.length,0);
await actor(outsider);assert.deepEqual((await db.query('select id from inquiries order by id')).rows.map(r=>r.id),[ic,pool]);
await db.exec('reset role');await actor(ling);
// The existing inquiry trigger must also enforce scope for SECURITY DEFINER writes.
await db.exec(`create trigger inquiries_role_overlap_scope before update on inquiries for each row execute function private.enforce_role_overlap_scope()`);
// Valid ended-month ratings can be created without an owner-created cycle.
const scores={execution:3,professionalism:4,goal_delivery:3,growth:4};
const submit=key=>db.query(`select submit_direct_sales_360_evaluation($1,'2025-08-01',$2,null,null) as value`,[key,scores]);
for(const key of [a,b])assert.equal((await submit(key)).rows[0].value.status,'submitted');
for(const key of [other,test])await assert.rejects(()=>submit(key),/直属主管|有效业务员/);
assert.equal((await db.query('select count(*)::int as n from sales_360_evaluation_responses')).rows[0].n,2);
await assert.rejects(()=>submit(a),/截止或完成/);
// Cross-team assignments are denied before any mutation or integration event.
await assert.rejects(()=>db.query("select assign_inquiry_to_sales($1,$2,'隔离测试分配范围')",[pool,other]),/授权团队/);
await assert.rejects(()=>db.query("select assign_inquiry_to_sales($1,$2,'隔离测试分配范围')",[ic,a]),/授权团队/);
assert.equal((await db.query('select count(*)::int as n from inquiry_assignment_history')).rows[0].n,0);
// Quote review blocks self-review and out-of-scope before mutation.
for(const [key,inq,creator] of [[id(31),ic,other],[id(32),ia,ling]])await db.query("insert into quotation_versions(id,inquiry_id,created_by,status) values($1,$2,$3,'pending_approval')",[key,inq,creator]);
await assert.rejects(()=>db.query("select review_quotation($1,true,'审核隔离测试')",[id(31)]),/授权团队/);
await assert.rejects(()=>db.query("select review_quotation($1,true,'审核隔离测试')",[id(32)]),/本人报价/);

await db.query("select assign_inquiry_to_sales($1,$2,'隔离测试同团队分配')",[ia,b]);
assert.equal((await db.query('select owner_id from inquiries where id=$1',[ia])).rows[0].owner_id,b);
await assert.rejects(()=>db.query("select create_quotation_version($1,'合成报价','USD',10,null,null,null)",[ia]),/日常客户操作/);
await assert.rejects(()=>db.query("select record_inquiry_followup($1,'email','合成跟进',null,null,false)",[ia]),/日常客户操作/);
// Workspace read functions must follow the same two-team scope, including risk cases.
assert.equal((await db.query('select get_my_sales_360_workspace() as w')).rows[0].w.visible_results.length,2);
for(const [key,subject,inq,domain] of [[id(41),a,ia,'business'],[id(42),b,ib,'business'],[id(43),other,ic,'business'],[id(44),null,pool,'business'],[id(45),null,null,'business'],[id(46),a,ia,'security'],[id(47),a,ic,'business']])
 await db.query("insert into risk_cases(id,subject_user_id,inquiry_id,domain,severity,status,title) values($1,$2,$3,$4,'p2','open','合成风险')",[key,subject,inq,domain]);
assert.deepEqual((await db.query('select get_my_risk_review_workspace() as w')).rows[0].w.cases.map(c=>c.id).sort(),[id(41),id(42),id(44)]);
await assert.rejects(()=>db.query("select review_risk_case($1,'start_review','隔离测试跨团队拒绝')",[id(43)]),/本团队业务风险/);
await assert.rejects(()=>db.query("select review_risk_case($1,'start_review','隔离测试无归属拒绝')",[id(45)]),/本团队业务风险/);
assert.equal((await db.query("select review_risk_case($1,'start_review','隔离测试同团队允许') as x",[id(42)])).rows[0].x.status,'under_review');
// Actual scanner + case creation with production function bodies; synthetic data only.
const riskFoundation=await read('supabase/migrations/20260920090000_risk_review_center.sql');
const due=riskFoundation.match(/create or replace function private\.risk_due_at[\s\S]*?end \$\$;/i);
assert.ok(due);await db.exec(due[0]);
await db.exec('alter table risk_cases alter column id set default gen_random_uuid()');
await actor(owner);
await db.exec("update inquiries set created_at=now()-interval '2 days',first_contact_due_at=now()-interval '2 hours',first_valid_contact_at=null,next_follow_up_at=null");
await actor(ling);
const scan=(await db.query('select run_crm_risk_scan() as result')).rows[0].result;
const detected=(await db.query("select inquiry_id from risk_cases where detection_source='deterministic_scan' order by inquiry_id")).rows.map(r=>r.inquiry_id);
assert.deepEqual(detected,[ia,ib,pool]);
assert.equal(scan.scanned,3);
// Revoking an explicit team also invalidates prior manager scoring tasks.
await db.query("update private.crm_manager_teams set active=false where manager_id=$1 and team='海外工程部'",[ling]);
const assignment=(await db.query("select id from sales_360_evaluation_assignments where evaluator_id=$1 and subject_id=$2 and evaluator_group='manager'",[ling,b])).rows[0].id;
await assert.rejects(()=>db.query('select submit_sales_360_evaluation($1,$2,null,null)',[assignment,scores]),/授权团队/);
assert.equal((await db.query('select get_my_sales_360_workspace() as w')).rows[0].w.visible_results.length,1);
await db.query("update private.crm_manager_teams set active=true where manager_id=$1",[ling]);

await actor(null);await assert.rejects(()=>db.query('select get_my_management_scope()'),/仅管理角色/);
console.log('Manager scope PostgreSQL: dual-team roster, RLS, null/test exclusions, audit immutability, revoke, direct scores, assignment and quote denials passed');
await db.close();
