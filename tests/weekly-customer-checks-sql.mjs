// Isolated PostgreSQL only. Never sends messages or connects to production.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]);const db=new PGlite();
const migration=async name=>db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
const source=await readFile(new URL('./daily-lead-unified-sql.mjs',import.meta.url),'utf8');
const setup=source.slice(source.indexOf('await db.exec(`'),source.indexOf('  const dates='));
const ids=await new (Object.getPrototypeOf(async function(){}).constructor)('db','migration',setup+';return ids;')(db,migration);
try{
 await migration('20261027133000_sales_lead_division_digest.sql');await migration('20261028110000_daily_report_timeliness.sql');
 await db.exec('alter table public.inquiries add column if not exists next_follow_up_at timestamptz;alter table public.inquiries add column if not exists excluded_from_dashboard boolean default false;');
 await migration('20261028153000_weekly_customer_checks.sql');
 const today=(await db.query("select (clock_timestamp() at time zone 'Asia/Shanghai')::date::text d")).rows[0].d;
 const as=async k=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[ids[k]||'']);await db.exec('set role '+(k?'authenticated':'anon'))};
 const future=new Date(today+'T00:00:00Z');future.setUTCDate(future.getUTCDate()+2);const next=future.toISOString().slice(0,10);
 await as('m');await db.query("select public.configure_weekly_customer_rules($1,1,'17:00',5,'17:05','17:00','synthetic weekly customer rule')",[next]);
 await assert.rejects(()=>db.query("select public.configure_weekly_customer_rules($1,1,'17:00',5,'16:00','17:00','wrong time')",[next]));
 await as('s');await assert.rejects(()=>db.query("select public.configure_weekly_customer_rules($1,1,'17:00',5,'17:05','17:00','cannot configure')",[next]));
 const inquiry=crypto.randomUUID(),other=crypto.randomUUID();await db.exec('reset role');
 await db.query("insert into public.inquiries(id,title,status,owner_id,estimated_amount,currency,expected_close_date,is_test_data,data_environment,created_at) values($1,'Synthetic own inquiry','received',$2,null,'USD',null,false,'production',clock_timestamp()),($3,'Synthetic other inquiry','received',$4,100,'USD','2026-12-01',false,'production',clock_timestamp())",[inquiry,ids.s,other,ids.s2]);
 await db.query("insert into public.inquiries(id,title,status,owner_id,validity,is_test_data,data_environment,created_at) values(gen_random_uuid(),'Synthetic invalid inquiry','received',$1,'invalid',false,'production',clock_timestamp())",[ids.s]);
 await as('s');let w=(await db.query('select public.weekly_customer_workspace() r')).rows[0].r;assert.equal(w.people.length,1);assert.equal(w.items.length,1);assert.equal(w.items[0].id,inquiry);assert.equal(w.can_submit,true);
 const details={last_contact_on:today,followup_result:'Synthetic requirements checked',next_action:'Confirm product application',unknown_fields:[]};
 await assert.rejects(()=>db.query('select public.submit_weekly_customer_check($1,$2)',[other,details]));
 await assert.rejects(()=>db.query('select public.submit_weekly_customer_check($1,$2)',[inquiry,{...details,last_contact_on:null}]));
 await assert.rejects(()=>db.query('select public.submit_weekly_customer_check($1,$2)',[inquiry,{...details,unknown_fields:[null]}]));
 const receipt=(await db.query('select public.submit_weekly_customer_check($1,$2) r',[inquiry,details])).rows[0].r;assert.ok(receipt.recorded_at);assert.deepEqual(receipt.unknown_fields,['estimated_amount','expected_close_date']);
 w=(await db.query('select public.weekly_customer_workspace() r')).rows[0].r;assert.equal(w.items[0].last_check.id,receipt.id);assert.equal(w.items[0].last_check.followup_result,details.followup_result);assert.equal(w.items[0].current_values_checked,true);
 const second=(await db.query('select public.submit_weekly_customer_check($1,$2) r',[inquiry,details])).rows[0].r;assert.notEqual(second.id,receipt.id);
 w=(await db.query('select public.weekly_customer_workspace() r')).rows[0].r;assert.equal(w.people[0].reviewed,1);assert.equal(w.people[0].unknown_fields,2);
 const past=new Date(today+'T00:00:00Z');past.setUTCDate(past.getUTCDate()-14);const old=(await db.query('select public.weekly_customer_workspace($1) r',[past.toISOString().slice(0,10)])).rows[0].r;assert.deepEqual(old.people,[]);assert.deepEqual(old.items,[]);assert.equal(old.history_unavailable,true);
 await as('m');w=(await db.query('select public.weekly_customer_workspace() r')).rows[0].r;assert.equal(w.people.length,2);assert.deepEqual(w.items,[]);assert.equal(w.total,0);assert.equal(JSON.stringify(w).includes(details.followup_result),false);await assert.rejects(()=>db.query('select public.submit_weekly_customer_check($1,$2)',[inquiry,details]));
 await as('boss');w=(await db.query('select public.weekly_customer_workspace() r')).rows[0].r;assert.equal(w.people.length,1);assert.equal(w.items[0].id,inquiry);await assert.rejects(()=>db.query('select public.weekly_customer_workspace($1,$2)',[today,ids.s2]));
 await as(null);await assert.rejects(()=>db.query('select public.weekly_customer_workspace()'));await db.exec('reset role');await db.exec('set role authenticated');await assert.rejects(()=>db.exec('select * from private.weekly_customer_checks'));await db.exec('reset role');
 await assert.rejects(()=>db.query("update private.weekly_customer_checks set next_action='tamper' where id=$1",[receipt.id]));
 // Later source changes remain visible as needing a fresh check. Review doesn't change the CRM workflow.
 await db.query('update public.inquiries set estimated_amount=500 where id=$1',[inquiry]);await as('s');w=(await db.query('select public.weekly_customer_workspace() r')).rows[0].r;assert.equal(w.items[0].current_values_checked,false);assert.equal(w.items[0].source.stage,'received');assert.equal(w.items[0].source.estimated_amount,500);
 await db.exec('reset role');
 const friday='2026-11-06',week='2026-11-02';
 // Even if Friday day records retain old 16:00 rules, the division must wait
 // until the newly approved global 17:05; never replay old person cutoffs.
 await db.query("insert into private.sales_lead_days(sales_id,day,rule_id) select p.id,$1::date,(select id from private.sales_lead_rules order by effective_on limit 1) from public.profiles p where p.id=any($2) on conflict do nothing",[friday,[ids.s,ids.s2]]);

 const insert=async(id,sales,at)=>db.query("insert into private.weekly_customer_checks(inquiry_id,sales_id,week_start,recorded_at,last_contact_on,followup_result,next_action,unknown_fields,source_snapshot,source_fingerprint) values($1,$2,$3,$4,'2026-11-06','Synthetic review','Synthetic next step','{}','{}','synthetic')",[id,sales,week,at]);
 await insert(inquiry,ids.s,'2026-11-06T09:00:00Z');await insert(other,ids.s2,'2026-11-06T09:00:00.001Z');
 let counts=(await db.query('select private.weekly_customer_counts($1,$2,$3) r',[[ids.s,ids.s2],week,'2026-11-06T09:00:00Z'])).rows[0].r;assert.equal(counts.find(p=>p.sales_id===ids.s).reviewed,1);assert.equal(counts.find(p=>p.sales_id===ids.s2).reviewed,0);
 await db.query('select private.process_sales_lead_schedule($1)',['2026-11-06T09:04:59Z']);assert.equal((await db.query("select count(*)::int n from private.sales_lead_delivery where delivery_key='division-weekly:2026-11-02'")).rows[0].n,0);
 await db.query('select private.process_sales_lead_schedule($1)',['2026-11-06T09:05:00Z']);const snap=(await db.query("select card_data from private.sales_lead_delivery where delivery_key='division-weekly:2026-11-02'")).rows[0].card_data;assert.equal(snap.customer_updates.people.length,2);assert.equal(snap.customer_updates.people.find(p=>p.sales_id===ids.s2).reviewed,0);assert.equal(JSON.stringify(snap).includes('followup_result'),false);assert.equal(JSON.stringify(snap).includes('estimated_amount'),false);
 await db.query('select private.process_sales_lead_schedule($1)',['2026-11-06T09:06:00Z']);assert.deepEqual((await db.query("select card_data from private.sales_lead_delivery where delivery_key='division-weekly:2026-11-02'")).rows[0].card_data,snap);
 assert.equal((await db.query("select count(*)::int n from private.sales_lead_delivery where delivery_key='division-weekly:2026-11-02'")).rows[0].n,1);
 console.log('Weekly customer SQL: own submit/readback, team/market privacy, no proxy, explicit unknown, source drift, future immutable config, exact 17:00 cutoff, one 17:05 snapshot, no duplicate queue PASS');
}finally{await db.close()}
