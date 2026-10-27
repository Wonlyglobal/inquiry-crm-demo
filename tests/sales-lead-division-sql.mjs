// Offline, in-memory PostgreSQL; no network, live profiles, mail or webhook calls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]||'@electric-sql/pglite');
// Reuse the repository's reviewed minimal schema shell and synthetic identities.
const fixture=await readFile(new URL('./sales-leads-sql.mjs',import.meta.url),'utf8');
const setup=fixture.slice(fixture.indexOf('await db.exec(`'),fixture.indexOf('const as=async'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const {db,ids}=await new AsyncFunction('PGlite','readFile','fixtureUrl',
 "const db=new PGlite();"+setup.replaceAll("new URL('../supabase/migrations/'+f,import.meta.url)","new URL('../supabase/migrations/'+f,fixtureUrl)")+";return {db,ids}")(PGlite,readFile,import.meta.url);
let checks=0;const ok=(x,message)=>{assert.ok(x,message);checks++};
try{
 const before=(await db.query("select proacl::text acl from pg_proc where oid='public.claim_sales_lead_delivery()'::regprocedure")).rows[0].acl;
 await db.exec(await readFile(new URL('../supabase/migrations/20261027133000_sales_lead_division_digest.sql',import.meta.url),'utf8'));
 ok((await db.query("select proacl::text acl from pg_proc where oid='public.claim_sales_lead_delivery()'::regprocedure")).rows[0].acl===before,'Existing claim ACL unchanged');
 const day='2026-11-02',at='2026-11-02T09:00:00Z';
 for(const [key,active,test,environment] of [['inactive',false,false,'production'],['test',true,true,'production'],['sandbox',true,false,'test']]){
  await db.query('insert into public.profiles(id,full_name,team,role,active,is_test_data,data_environment) values(gen_random_uuid(),$1,\'A\',\'sales\',$2,$3,$4)',[key,active,test,environment]);
 }
 for(let i=0;i<3;i++)await db.query(`insert into private.sales_leads(sales_id,acquired_on,recorded_on,recorded_at,company,country,email,source,demand,method,request_id,fingerprint)
 values($1,$2,$2,'2026-11-02T08:00:00Z','PRIVATE-CUSTOMER','合成地区','private@example.invalid','outbound','合成需求','manual',gen_random_uuid(),$3)`,[ids.s,day,'digest-'+i]);
 // A later entry must not leak into the 17:00 frozen digest.
 await db.query(`insert into private.sales_leads(sales_id,acquired_on,recorded_on,recorded_at,country,source,demand,method,request_id,fingerprint)
 values($1,$2,$2,'2026-11-02T09:01:00Z','合成地区','outbound','合成需求','manual',gen_random_uuid(),'after-cutoff')`,[ids.s,day]);
 await db.query('select private.process_sales_lead_schedule($1)', ['2026-11-02T08:59:00Z']);
 ok((await db.query("select count(*)::int n from private.sales_lead_delivery where delivery_key like 'division-%'")).rows[0].n===0,'No early external digest');
 await db.query('select private.process_sales_lead_schedule($1)',[at]);
 const digest=(await db.query("select * from private.sales_lead_delivery where delivery_key='division-daily:2026-11-02'")).rows[0];
 ok(digest.body.includes('全员2人｜新增3条'),'Includes full active production sales roster, not only missing people');
 ok(digest.body.indexOf('1. 合成s')<digest.body.indexOf('2. 合成s2'),'Descending ranks, zero entry included');
 ok(digest.body.includes('达标1人')&&digest.body.includes('未提交1人'),'Correct status totals');
 ok(!/PRIVATE-CUSTOMER|private@example|inactive|sandbox/.test(digest.body),'No customer content or out-of-scope users');
 ok((await db.query("select count(*)::int n from public.notifications where type='sales_lead_daily_due' and recipient_id=$1",[ids.s2])).rows[0].n===1,'Personal site reminder retained');
 ok((await db.query("select count(*)::int n from private.sales_lead_delivery where delivery_key like 'daily:%' and superseded_at is not null and sent_at is null")).rows[0].n===1,'Individual outbox superseded, not falsely sent');
 await db.query('select private.process_sales_lead_schedule($1)', ['2026-11-02T10:00:00Z']);
 ok((await db.query("select count(*)::int n from private.sales_lead_delivery where delivery_key='division-daily:2026-11-02'")).rows[0].n===1,'Repeated schedule queues one daily message');
 ok((await db.query('select body from private.sales_lead_delivery where id=$1',[digest.id])).rows[0].body===digest.body,'First digest cutoff stays frozen');
 await db.exec('set role service_role');
 const queue=(await db.query('select public.claim_sales_lead_delivery() r')).rows[0].r;
 ok(queue.length===1&&queue[0].id===digest.id,'Worker claims only one whole-division message');
 ok((await db.query('select public.claim_sales_lead_delivery() r')).rows[0].r.length===0,'Lease suppresses concurrent repeat');
 await db.query('select public.finish_sales_lead_delivery($1,true)',[digest.id]);await db.exec('reset role');
 const inquiry=crypto.randomUUID();
 await db.query("insert into public.inquiries(id,owner_id,status) values($1,$2,'received')",[inquiry,ids.s2]);
 await db.query(`insert into private.sales_leads(sales_id,acquired_on,recorded_on,recorded_at,country,source,demand,method,request_id,fingerprint,inquiry_id,converted_at)
 values($1,'2026-11-01','2026-11-01','2026-11-01T08:00:00Z','合成地区','outbound','合成需求','manual',gen_random_uuid(),'old-cohort-conversion',$2,'2026-11-04T08:00:00Z')`,[ids.s2,inquiry]);
 await db.query('select private.sales_lead_day($1,$2)',[ids.s,'2026-11-06']);
 await db.exec("insert into private.sales_lead_rules(effective_on,daily_min,remind_at,weekly_day,weekly_at,reason) values('2026-11-05',2,'17:00',5,'17:30','合成冻结截止差异')");
 await db.query('select private.sales_lead_day($1,$2)',[ids.s2,'2026-11-06']);
 await db.query('select private.process_sales_lead_schedule($1)', ['2026-11-06T08:00:00Z']);
 ok((await db.query("select count(*)::int n from private.sales_lead_weekly where week_start='2026-11-02'")).rows[0].n===1,'One member weekly snapshot ready before later frozen cutoff');
 ok((await db.query("select count(*)::int n from private.sales_lead_delivery where delivery_key='division-weekly:2026-11-02'")).rows[0].n===0,'No partial department weekly push');
 await db.query('select private.process_sales_lead_schedule($1)', ['2026-11-06T09:30:00Z']);
 const weekly=(await db.query("select * from private.sales_lead_delivery where delivery_key='division-weekly:2026-11-02'")).rows[0];
 ok(weekly.body.includes('全员2人｜新增4条｜本周转商机1条'),'Weekly includes complete roster and old-cohort conversions without counting old leads as new');
 ok(weekly.body.includes('1. 合成s2：转商机1条 / 新增0条')&&weekly.body.includes('2. 合成s：转商机0条 / 新增4条'),'Weekly prioritizes actual conversion, not new lead volume');
 await db.query('select private.process_sales_lead_schedule($1)', ['2026-11-06T09:35:00Z']);
 ok((await db.query("select count(*)::int n from private.sales_lead_delivery where delivery_key like 'division-weekly:%'")).rows[0].n===1,'Weekly repeats do not enqueue duplicates');
 await db.query('select private.process_sales_lead_schedule($1)', ['2026-11-07T09:00:00Z']);
 ok((await db.query("select count(*)::int n from private.sales_lead_delivery where delivery_key='division-daily:2026-11-07'")).rows[0].n===0,'No weekend daily push');
 // Equal zero volumes share the same rank; no-new declarations and exemptions
 // remain separate statuses, never positive lead counts or formal report submits.
 await db.query('select private.sales_lead_day($1,$2)',[ids.s,'2026-11-09']);
 await db.query('select private.sales_lead_day($1,$2)',[ids.s2,'2026-11-09']);
 await db.query("update private.sales_lead_days set no_new_reason='PRIVATE-REASON',declared_at=clock_timestamp() where sales_id=$1 and day='2026-11-09'",[ids.s]);
 await db.query("update private.sales_lead_days set exempt_reason='PRIVATE-LEAVE',exempt_at=clock_timestamp() where sales_id=$1 and day='2026-11-09'",[ids.s2]);
 await db.query('select private.process_sales_lead_schedule($1)', ['2026-11-09T09:00:00Z']);
 const tied=(await db.query("select body from private.sales_lead_delivery where delivery_key='division-daily:2026-11-09'")).rows[0].body;
 ok(tied.includes('无新增申报1人｜未提交0人｜未达标0人｜豁免1人'),'Declaration and exemption totals remain separate');
 ok((tied.match(/1\. 合成/g)||[]).length===2,'Equal volumes have equal ranks');
 ok(!/PRIVATE-REASON|PRIVATE-LEAVE/.test(tied),'Private declaration/leave reasons never pushed');
 await db.exec('set role anon');await assert.rejects(()=>db.query('select public.claim_sales_lead_delivery()'));checks++;
 await assert.rejects(()=>db.query('select private.process_sales_lead_schedule()'));checks++;
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>db.query('select public.claim_sales_lead_delivery()'));checks++;
 await assert.rejects(()=>db.query('select private.process_sales_lead_personal_schedule_v1()'));checks++;
 console.log(JSON.stringify({checks,synthetic:true,production_writes:false,external_sends:0}));
}finally{await db.close()}
