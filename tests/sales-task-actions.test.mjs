import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function salesTaskAdvice('),html.indexOf('      async function completeFollowUpFromCalendar('));
function setup(overrides={}){const ctx=vm.createContext({Date,profile:{role:'sales',id:'seller'},...overrides});vm.runInContext(source,ctx);return ctx}
const now=Date.parse('2026-09-20T08:00:00Z');
test('followup validates actual content, future time and supported method',()=>{
 const ctx=setup(),base={content:' actual call ',feedback:' ',next:'2026-09-21T08:00:00Z',method:'phone'};
 const payload=ctx.salesTaskFollowupPayload('inquiry',base,now);
 assert.equal(payload.follow_content,'actual call');assert.equal(payload.customer_response,null);assert.equal(payload.mark_first_valid_contact,false);
 for(const change of [{content:' '},{next:'invalid'},{next:'2026-09-19T08:00:00Z'},{method:'auto'}])assert.throws(()=>ctx.salesTaskFollowupPayload('inquiry',{...base,...change},now));
});
test('non-sales entry performs no query',async()=>{let calls=0;const ctx=setup({profile:{role:'sales_manager'},toast:()=>calls++,supabase:{from:()=>assert.fail('unexpected read')}});await ctx.openSalesTask({id:'x'});assert.equal(calls,1)});
test('lost or inaccessible inquiry cannot open an action form',async()=>{
 for(const data of [null,{status:'lost',validity:'valid'},{status:'contacted',validity:'invalid'},{status:'contacted',validity:'valid',excluded_from_dashboard:true}]){
  let shown=0;const query={select(){return this},eq(){return this},single:async()=>({data})};
  const ctx=setup({supabase:{from:()=>query},toast:()=>{},openDashboardModal:()=>shown++});await ctx.openSalesTask({id:'x'});assert.equal(shown,0);
 }
});
test('task advice is deterministic and category-specific',()=>{const ctx=setup();assert.match(ctx.salesTaskAdvice({category:'reply'}),/原文/);assert.match(ctx.salesTaskAdvice({category:'quote'}),/审批/);assert.match(ctx.salesTaskAdvice({category:'expiring'}),/保留/)});
test('action path uses controlled workflows and never generates AI or sends on open',()=>{
 assert.match(source,/rpc\("record_inquiry_followup_v2"/);assert.match(source,/rpc\("complete_follow_up_task"/);
 assert.doesNotMatch(source,/functions\.invoke|\.insert\(|\.update\(|mailbox-compose-send/);
 assert.match(source,/eq\("owner_id",profile.id\)/);assert.match(source,/eq\("inquiry_id",inquiry.id\).eq\("author_id",profile.id\)/);
});
