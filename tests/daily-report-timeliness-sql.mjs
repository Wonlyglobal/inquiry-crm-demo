// Local PostgreSQL, synthetic identities only, no production or notification calls.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.argv[2]);const db=new PGlite();
const migration=async name=>db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
const source=await readFile(new URL('./daily-lead-unified-sql.mjs',import.meta.url),'utf8');
const setup=source.slice(source.indexOf('await db.exec(`'),source.indexOf('  const dates='));
const ids=await new (Object.getPrototypeOf(async function(){}).constructor)('db','migration',setup+';return ids;')(db,migration);
try{
 await migration('20261027133000_sales_lead_division_digest.sql');
 await migration('20261028110000_daily_report_timeliness.sql');
 const start=(await db.query('select min(effective_on)::text d from private.daily_report_deadlines')).rows[0].d;
 // Future weekday synthetic fixture, after activation date; no historical backfill.
 const monday='2026-11-02';
 await db.exec("insert into private.sales_lead_rules(effective_on,daily_min,remind_at,weekly_day,weekly_at,reason) values('2026-10-29',1,'17:00',5,'16:00','synthetic') on conflict do nothing");
 const report=async(id,day,status,at,sim=false)=>db.query('insert into public.daily_sales_reports(sales_id,report_date,status,submitted_at,is_simulated) values($1,$2,$3,$4,$5)',[id,day,status,at,sim]);
 await report(ids.s,monday,'submitted','2026-11-02T10:00:00Z'); // exact boundary on time
 await report(ids.s,'2026-11-03','submitted','2026-11-03T10:00:00.001Z');
 await report(ids.s,'2026-11-04','draft',null);
 await report(ids.s,'2026-11-05','submitted','2026-11-05T09:00:00Z',true);
 await db.query('select private.sales_lead_day($1,$2)',[ids.s,'2026-11-06']);
 await db.query("update private.sales_lead_days set exempt_reason='synthetic leave' where sales_id=$1 and day='2026-11-06'",[ids.s]);
 const stats=async(from,to,at)=>(await db.query('select private.report_timeliness($1,$2,$3,$4) r',[[ids.s],from,to,at])).rows[0].r[0];
 let r=await stats(monday,'2026-11-08','2026-11-08T12:00:00Z');
 assert.equal(r.expected,4);assert.equal(r.on_time,1);assert.equal(r.late,1);assert.equal(r.missing,2);assert.equal(r.rate,25);
 r=await stats(monday,monday,'2026-11-02T09:59:59Z');assert.equal(r.expected,0);assert.equal(r.pending,1);assert.equal(r.rate,null);
 r=await stats('2026-01-01','2026-01-01','2026-11-02T11:00Z');assert.equal(r.expected,0);
 await db.query("select set_config('test.uid',$1,false)",[ids.s]);await db.exec('set role authenticated');
 let visible=(await db.query('select public.daily_report_timeliness($1,$2) r',[start,start])).rows[0].r;
 assert.equal(visible.people.length,1);assert.equal(visible.people[0].sales_id,ids.s);
 await assert.rejects(()=>db.query("select public.configure_daily_report_deadline('2027-01-01','19:00','synthetic rule')"),/仅市场部/);
 await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[ids.m]);await db.exec('set role authenticated');
 await db.query("select public.configure_daily_report_deadline('2027-01-01','19:00','synthetic future rule')");
 await assert.rejects(()=>db.query("select public.configure_daily_report_deadline($1,'19:00','same day rule')",[start]),/明日起/);
 await db.exec('reset role');
 // Schedule preserves station reminders but daily external summary waits for deadline.
 await db.query('select private.process_sales_lead_schedule($1)',['2026-11-09T09:00Z']);
 assert.equal((await db.query("select count(*)::int n from private.sales_lead_delivery where delivery_key='division-daily:2026-11-09'")).rows[0].n,0);
 await db.query('select private.process_sales_lead_schedule($1)',['2026-11-09T10:00Z']);
 const snap=(await db.query("select card_data from private.sales_lead_delivery where delivery_key='division-daily:2026-11-09'")).rows[0].card_data;
 assert.equal(snap.version,1);assert.equal(snap.timeliness.length,2);
 await db.query('select private.process_sales_lead_schedule($1)',['2026-11-09T11:00Z']);
 assert.deepEqual((await db.query("select card_data from private.sales_lead_delivery where delivery_key='division-daily:2026-11-09'")).rows[0].card_data,snap);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select public.daily_report_timeliness($1,$2)',[start,start]),/permission denied/);
 await db.exec('reset role');await db.exec('set role authenticated');await assert.rejects(()=>db.exec('select * from private.daily_report_deadlines'),/permission denied/);
 console.log('Timeliness SQL: boundary, late, draft, simulation, exemptions, weekends, future, no-backfill, self-scope, config, snapshot and anonymous guards PASS');
}finally{await db.close()}
