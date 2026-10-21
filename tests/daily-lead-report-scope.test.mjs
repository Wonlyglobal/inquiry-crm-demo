import test from 'node:test';
import assert from 'node:assert/strict';
import {reportWindow,summarizeLeads,renderLeadReport,deliverDailyLeadReport} from '../mail-sync/src/daily-lead-report.mjs';

test('Shanghai reporting day and cutoff are independent of server timezone',()=>{
 const window=reportWindow(new Date('2026-10-20T16:01:00Z'));
 assert.equal(window.date,'2026-10-21');assert.equal(window.hour,0);assert.equal(window.cutoff,'00:01');
 assert.equal(window.start,'2026-10-21T00:00:00+08:00');
});
test('all channels count regardless of creator and self-development requires explicit attribution',()=>{
 const rows=[{id:'1',created_by:'market',source:'website',validity:'pending'},{id:'2',created_by:'admin',source:'email',validity:'valid'},{id:'3',created_by:'sales',source:'exhibition',validity:'invalid'},{id:'4',created_by:'sales',source:'whatsapp',primary_source:'self_developed',validity:'valid'}];
 const summary=summarizeLeads([...rows,rows[0]],new Set(['sales']));
 assert.equal(summary.total,4);assert.equal(summary.salesCreated,2);assert.equal(summary.selfDeveloped,1);
 assert.deepEqual(summary.validity,{valid:2,pending:1,invalid:1,unknown:0});assert.equal(summary.channels['官网表单'],1);
});
test('report distinguishes lead count and pending backlog while excluding raw private fields',()=>{
 const summary=summarizeLeads([{id:'1',source:'unknown raw company name',validity:'pending',company:'Private Company',email:'secret@example.test'}]);
 const text=renderLeadReport({window:reportWindow(new Date('2026-10-21T10:00:00Z')),summary,pendingToday:2,pendingTotal:7,legacy:true});
 assert.match(text,/今日新增登记：1/);assert.match(text,/仍待分拣：2/);assert.match(text,/积压：7/);assert.match(text,/不与新增询盘相加/);assert.match(text,/created_at/);assert.match(text,/口径更正/);
 assert.doesNotMatch(text,/Private Company|secret@example|unknown raw/);
});
function fakeDb({sent=[],rows=[],count=4,error=null}={}){
 const events=[];
 return {events,from(table){
  const query={select(){return query},eq(){return query},is(){return query},or(){return query},gte(){return query},order(){return query},range(){return Promise.resolve({data:rows,error})},lte(){return query},
   then(resolve,reject){return Promise.resolve(table==='audit_logs'?{data:sent,error:null}:table==='profiles'?{data:[{id:'sales'}],error:null}:{count,error}).then(resolve,reject)},
   insert(row){events.push(row);return Promise.resolve({error:null})}};return query;
 }};
}
const now=new Date('2026-10-21T10:05:00Z');
test('legacy report is superseded once and version 2 deduplicates subsequent runs',async()=>{
 const db=fakeDb({sent:[{after_data:{report_date:'2026-10-21',lead_count:0}}],rows:[{id:'x',source:'website',created_by:'market',validity:'pending'}]});
 const sent=[];
 const result=await deliverDailyLeadReport({db,now,feishuWebhook:'https://example.test/hook',fetchImpl:async(url,options)=>{sent.push(JSON.parse(options.body));return Response.json({code:0})}});
 assert.equal(result.lead_count,1);assert.equal(result.report_version,2);assert.equal(sent.length,1);assert.match(sent[0].content.text,/口径更正/);
 const duplicateDb=fakeDb({sent:[{after_data:result}]});
 assert.equal((await deliverDailyLeadReport({db:duplicateDb,now,feishuWebhook:'https://example.test/hook',fetchImpl:()=>{throw new Error('must not send')}})).skipped,'already_sent');
});
test('data failure cannot become a zero-valued report or be recorded as sent',async()=>{
 const db=fakeDb({error:new Error('database unavailable')});let sends=0;
 await assert.rejects(deliverDailyLeadReport({db,now,feishuWebhook:'https://example.test/hook',fetchImpl:()=>{sends++;}}),/database unavailable/);
 assert.equal(sends,0);assert.equal(db.events.length,0);
});
test('failed group delivery never writes successful-report audit',async()=>{
 const db=fakeDb();await assert.rejects(deliverDailyLeadReport({db,now,feishuWebhook:'https://example.test/hook',fetchImpl:async()=>Response.json({code:999})}),/发送失败/);
 assert.equal(db.events.length,0);
});
