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
test('salesperson can explicitly complete assignment without a pre-existing message and refresh counts',async()=>{
 const elements=new Map();let rpcCalls=0,list=1,badge=1;
 const button={disabled:false,textContent:''};
 const node=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',classList:{add(){}},insertAdjacentHTML(){},querySelector(selector){return selector==='button[type="submit"]'?button:node(selector)},reportValidity:()=>true});return elements.get(id)};
 node('#task-contact-time').value='2026-10-10T02:00:00Z';node('#task-contact-note').value='已实际电话联系';
 const inquiry={id:'x',owner_id:'seller',status:'received',validity:'valid',assigned_at:'2026-10-10T00:00:00Z',inquiry_no:82,title:'synthetic'};
 const query={select(){return this},eq(){return this},in(){return this},order(){return this},limit(){return this},single:async()=>({data:inquiry}),maybeSingle:async()=>({data:null}),then(resolve){return Promise.resolve({data:[]}).then(resolve)}};
 const ctx=setup({$:node,esc:String,fmtDate:String,displayCountry:String,localDateTimeInputValue:String,openDashboardModal(){},toast(){},appConfirm:async()=>true,moduleMemoryCache:new Map(),activeModuleView:'sales-today',
  supabase:{from:()=>query,rpc:async(name,payload)=>{rpcCalls++;assert.equal(name,'confirm_assignment_first_contact');assert.equal(payload.evidence_follow_up_id,null);assert.equal(payload.actual_contact_at,'2026-10-10T02:00:00.000Z');return {data:{confirmed:true}}}},
  loadModule:async view=>{assert.equal(view,'sales-today');list=0},refreshSidebarBadges:async()=>{badge=0}});
 await ctx.openSalesTask({id:'x',category:'assigned'});
 await node('#task-contact-confirm').onsubmit({preventDefault(){}});
 assert.equal(rpcCalls,1);assert.equal(list,0);assert.equal(badge,0);assert.equal(button.disabled,true);
 await node('#task-contact-confirm').onsubmit({preventDefault(){}});assert.equal(rpcCalls,1);
});
