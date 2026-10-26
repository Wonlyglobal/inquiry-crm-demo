import test from 'node:test';
import assert from 'node:assert/strict';
import {isSubmittedDailyReport,submittedDailySalesIds,summarizeDailyLedger,readDailyLedgerHistory} from '../assets/daily-lead-reporting.mjs';

const date='2026-10-26';
const report={sales_id:'s',report_date:date,status:'submitted',submitted_at:'2026-10-26T08:00:00Z',is_simulated:false};
const lead={id:'lead-a',sales_id:'s',recorded_on:date,recorded_at:'2026-10-26T08:00:00Z',acquired_on:'2026-08-01',inquiry_id:null,converted_at:null};
const workspace=(leads=[],as_of='2027-01-01T00:00:00Z')=>({leads,as_of});

test('only explicit same-date non-simulated submitted reports count as submitted',()=>{
 assert.equal(isSubmittedDailyReport(report,date),true);
 for(const candidate of [null,{...report,status:'draft'},{...report,status:'SUBMITTED'},{...report,submitted_at:null},{...report,submitted_at:''},{...report,is_simulated:true},{...report,report_date:'2026-10-25'},{...report,report_date:'2026-10-27'}])assert.equal(isSubmittedDailyReport(candidate,date),false);
});

test('submitted ids are deduplicated within the explicitly authorized people only',()=>{
 const ids=submittedDailySalesIds([report,report,{...report,sales_id:'outside'},{...report,sales_id:'draft',status:'draft'},{...report,sales_id:'simulation',is_simulated:true}],date,[{id:'s'},{id:'draft'},{id:'simulation'}]);
 assert.deepEqual([...ids],['s']);
 assert.equal(submittedDailySalesIds([report],date,[]).size,0);
 assert.equal(submittedDailySalesIds([],date,[{id:'s'}]).size,0);
 assert.equal(submittedDailySalesIds([report],'2026-10-27',[{id:'s'}]).size,0);
});

test('daily ledger counts immutable recorded day without depending on report submission or acquisition day',()=>{
 const old={...lead,id:'old',recorded_on:'2026-10-25',recorded_at:'2026-10-25T08:00:00Z',acquired_on:date};
 const other={...lead,id:'other',sales_id:'other'};
 const workspace={leads:[lead,lead,old,other],as_of:'2026-10-26T08:20:00Z'};
 const own=summarizeDailyLedger(workspace,date,'s');
 assert.equal(own.newCount,1);assert.deepEqual(own.leads,[lead]);assert.equal(own.convertedCount,0);assert.equal(own.asOf,workspace.as_of);
 assert.equal(summarizeDailyLedger(workspace,date).newCount,2);
 assert.equal(summarizeDailyLedger(workspace,'2026-10-27','s').newCount,0);
 assert.deepEqual(workspace.leads,[lead,lead,old,other]);
});

test('conversions use Shanghai midnight and distinct inquiry ids independent of recording cohort',()=>{
 const before={...lead,id:'before',recorded_on:'2026-08-01',recorded_at:'2026-08-01T08:00:00Z',inquiry_id:'before',converted_at:'2026-10-25T15:59:59.999Z'};
 const start={...lead,id:'start',recorded_on:'2026-08-01',recorded_at:'2026-08-01T08:00:00Z',inquiry_id:'same',converted_at:'2026-10-25T16:00:00.000Z'};
 const duplicate={...start,id:'duplicate',converted_at:'2026-10-26T15:59:59.999Z'};
 const after={...lead,id:'after',inquiry_id:'after',converted_at:'2026-10-26T16:00:00.000Z'};
 const missing={...lead,id:'missing',converted_at:'2026-10-26T08:00:00Z'};
 const result=summarizeDailyLedger(workspace([before,start,duplicate,after,missing]),date,'s');
 assert.equal(result.newCount,2);assert.equal(result.convertedCount,1);assert.deepEqual(result.conversions,[duplicate]);
 assert.equal(result.asOf,'2027-01-01T00:00:00Z');
});

test('history reads inclusive 93-day chunks sequentially across leap day',async()=>{
 const calls=[];let active=0;
 const result=await readDailyLedgerHistory(async(from,to)=>{assert.equal(active,0);active++;calls.push([from,to]);await Promise.resolve();active--;return workspace([],`2024-07-05T00:00:0${calls.length}Z`)},'2024-01-01','2024-07-05');
 assert.deepEqual(calls,[['2024-01-01','2024-04-02'],['2024-04-03','2024-07-04'],['2024-07-05','2024-07-05']]);
 assert.deepEqual(result,{leads:[],conversions:[],asOf:'2024-07-05T00:00:03Z'});
});

test('single-day and exact-93-day histories never add an extra chunk',async()=>{
 const calls=[],load=async(from,to)=>{calls.push([from,to]);return workspace()};
 await readDailyLedgerHistory(load,date,date);assert.deepEqual(calls,[[date,date]]);
 calls.length=0;await readDailyLedgerHistory(load,'2026-01-01','2026-04-03');assert.deepEqual(calls,[['2026-01-01','2026-04-03']]);
});

test('history dedupes overlap by ledger id and conversions by inquiry id, retaining requested date and person scope',async()=>{
 const old={...lead,id:'old',recorded_on:'2025-12-01',recorded_at:'2025-12-01T08:00:00Z',inquiry_id:'old-conversion',converted_at:'2026-04-03T16:00:00Z'};
 const fresh={...lead,recorded_on:'2026-01-01',recorded_at:'2026-01-01T08:00:00Z'};
 const updated={...fresh,inquiry_id:'converted',converted_at:'2026-04-03T16:00:00Z'};
 const sameInquiry={...updated,id:'second',recorded_on:'2026-02-01',recorded_at:'2026-02-01T08:00:00Z'};
 const future={...lead,id:'future',recorded_on:'2026-04-05',recorded_at:'2026-04-05T08:00:00Z',inquiry_id:'future',converted_at:'2026-04-04T16:00:00Z'};
 const outside={...lead,id:'outside',recorded_on:'2026-01-02',recorded_at:'2026-01-02T08:00:00Z',sales_id:'other'};
 let page=0;
 const result=await readDailyLedgerHistory(async()=>workspace(++page===1?[fresh,outside,old,future]:[updated,sameInquiry,old],`2026-10-26T08:00:0${page}Z`), '2026-01-01','2026-04-04',{salesId:'s'});
 assert.deepEqual(result.leads,[updated,sameInquiry]);
 assert.deepEqual([...result.conversions].sort((a,b)=>a.id.localeCompare(b.id)),[old,sameInquiry]);
 assert.equal(result.asOf,'2026-10-26T08:00:02Z');
});

test('unavailable chunks reject instead of returning partial rows or fallback inquiry counts',async()=>{
 const failure=new Error('ledger unavailable');let calls=0;
 await assert.rejects(readDailyLedgerHistory(async()=>{if(++calls===2)throw failure;return workspace([{...lead,recorded_on:'2026-01-01',recorded_at:'2026-01-01T08:00:00Z'}])},'2026-01-01','2026-08-01'),error=>error===failure);
 assert.equal(calls,2);
 await assert.rejects(readDailyLedgerHistory(async()=>({inquiries:[lead]}),date,date),/账本未成功加载/);
 assert.throws(()=>summarizeDailyLedger({inquiries:[lead]},date),/账本未成功加载/);
});

test('invalid calendar dates and reversed ranges fail before any history read',async()=>{
 let calls=0;const load=async()=>{calls++;return workspace()};
 for(const [from,to] of [['2026-02-30',date],['bad',date],[date,'2026-10-25']])await assert.rejects(readDailyLedgerHistory(load,from,to),RangeError);
 assert.equal(calls,0);
 assert.throws(()=>summarizeDailyLedger(workspace(),'2026-02-29'),RangeError);
});

test('same-day future records and conversions do not exceed the workspace cutoff, including microseconds',()=>{
 const cutoff='2026-10-26T08:00:00.123456Z';
 const included={...lead,recorded_at:cutoff,inquiry_id:'included',converted_at:cutoff};
 const futureRecord={...lead,id:'future-record',recorded_at:'2026-10-26T08:00:00.123457Z'};
 const futureConversion={...lead,id:'future-conversion',inquiry_id:'future',converted_at:'2026-10-26T08:00:00.123457Z'};
 const result=summarizeDailyLedger(workspace([included,futureRecord,futureConversion],cutoff),date,'s');
 assert.equal(result.newCount,2);assert.equal(result.convertedCount,1);assert.deepEqual(result.conversions,[included]);
});

test('missing, malformed and timezone-less ledger timestamps fail closed',async()=>{
 for(const asOf of [undefined,'bad','2026-10-26T08:00:00','2026-02-30T08:00:00Z'])assert.throws(()=>summarizeDailyLedger({leads:[],as_of:asOf},date));
 for(const row of [{...lead,recorded_at:null},{...lead,recorded_at:'bad'},{...lead,converted_at:'bad'},{...lead,converted_at:'2026-10-26T08:00:00'}])assert.throws(()=>summarizeDailyLedger(workspace([row]),date));
 await assert.rejects(readDailyLedgerHistory(async()=>({leads:[],as_of:'bad'}),date,date),/截止时间无效/);
});

test('each history batch uses its own cutoff before aggregate deduplication',async()=>{
 const row={...lead,recorded_on:'2026-01-01',recorded_at:'2026-01-01T08:00:00Z',inquiry_id:'converted',converted_at:'2026-04-04T08:00:00Z'};
 let page=0;
 const result=await readDailyLedgerHistory(async()=>workspace([row],++page===1?'2026-04-04T07:59:59Z':'2026-04-04T08:00:00Z'),'2026-01-01','2026-04-04');
 assert.equal(result.leads.length,1);assert.equal(result.conversions.length,1);
});
