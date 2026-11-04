import test from 'node:test';import assert from 'node:assert/strict';
import {buildCustomerDirectory,filterCustomerDirectory,customerOrigin} from '../assets/customer-directory.mjs';
import {inquiryOrigins} from '../assets/official-inquiries.mjs';
const company={id:'c',name:'Example Doors',country:'Ghana'};
const make=(id,owner_id='a',rest={})=>({id,owner_id,company_id:'c',companies:company,status:'received',created_at:'2026-11-01',updated_at:'2026-11-02',...rest});
const people=[{id:'a',full_name:'业务员甲'},{id:'b',full_name:'业务员乙'}];
test('directory omits unassigned, archived, merged, simulated and excluded rows without changing inputs',()=>{
 const input=[make('ok'),make('unassigned',null),make('archived','a',{archived_at:'2026-11-03'}),make('merged','a',{merged_into_id:'ok'}),make('test','a',{is_test_data:true}),make('excluded','a',{excluded_from_dashboard:true}),make('dev','a',{data_environment:'test'})];const before=JSON.stringify(input);
 const rows=buildCustomerDirectory(input,[],people);assert.equal(rows.length,1);assert.deepEqual(rows[0].inquiries.map(i=>i.id),['ok']);assert.equal(JSON.stringify(input),before);
});
test('same company remains separate per owner and only explicitly linked contacts enter each drawer',()=>{
 const input=[make('i1','a',{contact_id:'ca'}),make('i2','b',{contact_id:'cb'})];
 const contacts=[{id:'ca',company_id:'c',full_name:'甲联系人'},{id:'cb',company_id:'c',full_name:'乙联系人'},{id:'unused',company_id:'c'}];
 const rows=buildCustomerDirectory(input,contacts,people);assert.equal(rows.length,2);assert.deepEqual(rows[0].contacts.map(c=>c.id),['ca']);assert.deepEqual(rows[1].contacts.map(c=>c.id),['cb']);assert.notEqual(rows[0].key,rows[1].key);
});
test('personal imports labelled website never become official; unknown provenance is explicit',()=>{
 const origins=new Map([['i1','personal'],['i2','official'],['i3','personal']]);
 assert.equal(customerOrigin(make('i1','a',{source:'website'}),origins),'personal');
 assert.equal(customerOrigin(make('i2','a',{source:'website'}),origins),'official');
 assert.equal(customerOrigin(make('i3','a',{source:'customer_referral'}),origins),'referral');
 assert.equal(customerOrigin(make('i4','a',{source:'email'}),origins),'unknown');
});
test('multi-source customer keeps all origins, filters combine and reset does not mutate rows',()=>{
 const rows=buildCustomerDirectory([make('i1'),make('i2','a',{status:'quoted'}),make('i3','b')],[],people,new Map([['i1','personal'],['i2','official'],['i3','unknown']]));
 assert.deepEqual(new Set(rows[0].sourceKeys),new Set(['personal','official']));
 assert.equal(filterCustomerDirectory(rows,{owner:'a',origin:'official',country:'Ghana',stage:'quoted',query:'example'}).length,1);
 assert.equal(filterCustomerDirectory(rows,{owner:'b',origin:'official'}).length,0);assert.equal(filterCustomerDirectory(rows,{}).length,2);
 assert.equal(rows[0].advanced,1);assert.equal(rows[0].unprogressed,1);
});
test('last followup and next plan use linked inquiry records, not another owner or a completed task',()=>{
 const rows=buildCustomerDirectory([make('ia'),make('ib','b')],[],people,new Map(),[
 {inquiry_id:'ia',created_at:'2026-11-03',next_follow_up_at:'2026-11-06'},
 {inquiry_id:'ia',created_at:'2026-11-04',next_follow_up_at:'2026-11-05',completed_at:'2026-11-04'},
 {inquiry_id:'ib',created_at:'2026-11-05',next_follow_up_at:'2026-11-04'},
 ]);assert.equal(rows[0].lastFollow,'2026-11-04');assert.equal(rows[0].nextFollow,'2026-11-06');assert.equal(rows[1].lastFollow,'2026-11-05');
});
test('provenance reads are batched and failures never silently guess customer origin',async()=>{
 let count=0;const rows=Array.from({length:401},(_,i)=>({id:String(i)}));const result=await inquiryOrigins(rows,async(name,{target_ids})=>{count++;return {data:target_ids.map(id=>({id,origin:'personal'}))}});assert.equal(count,3);assert.equal(result.size,401);
 await assert.rejects(()=>inquiryOrigins(rows,async()=>({error:{message:'denied'}})),/denied/);
});

import vm from 'node:vm';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
async function runCustomerLoader({stale=false,failOrigin=false}={}){
 const inquiries=Array.from({length:601},(_,n)=>make('i'+n,n%2?'a':'b',{contact_id:'ct'+n}));
 const calls=[],rendered=[];
 const tables={inquiries,contacts:inquiries.map(i=>({id:i.contact_id,company_id:'c'})),profiles:people,follow_ups:[]};
 const supabase={from(table){let values=tables[table];const q={select(){return q},not(){return q},is(){return q},eq(){return q},order(){return q},in(field,ids){calls.push([table,ids.length]);values=values.filter(i=>ids.includes(i[field]));return q},range(from,to){return Promise.resolve({data:values.slice(from,to+1),error:null})}};return q},rpc:async(name,{target_ids})=>failOrigin?{error:{message:'origin denied'}}:{data:target_ids.map(id=>({id,origin:'personal'}))}};
 const context=vm.createContext({supabase,inquiryOrigins,moduleLoadVersion:stale?2:1,loadVersion:1,activeModuleView:'customers',view:'customers',renderCustomerCore:(...args)=>rendered.push(args),query:null,columns:[],mapper:null});
 const helperStart=html.indexOf('      async function loadModuleRowsPaged('),helperEnd=html.indexOf('      function filterModuleRows',helperStart);
 vm.runInContext('async function runModuleQuery(q){return await q};'+html.slice(helperStart,helperEnd),context);
 const begin=html.indexOf('        } else if(view==="customers"){')+'        } else if(view==="customers"){'.length,end=html.indexOf('        } else if(view==="follow-calendar"){',begin);
 vm.runInContext('async function run(){'+html.slice(begin,end)+'}',context);await vm.runInContext('run()',context);
 return {calls,rendered,result:context.query?await context.query:null};
}
test('actual customer loader reads all pages, batches contact metadata and renders only current view',async()=>{
 const result=await runCustomerLoader();assert.equal(result.rendered.length,1);assert.equal(result.rendered[0][2].length,601);assert.equal(result.rendered[0][1].length,601);
 assert.ok(result.calls.every(([,size])=>size<=200));
 const stale=await runCustomerLoader({stale:true});assert.equal(stale.rendered.length,0);
});
test('actual customer loader never paints unverifiable origin data as official',async()=>{
 const result=await runCustomerLoader({failOrigin:true});assert.equal(result.rendered.length,0);assert.match(result.result.error.message,/origin denied/);
});

test('import choice requires explicit existing-customer selection and routes daily leads without writing',()=>{
 const start=html.indexOf('      function chooseCustomerImportKind()'),end=html.indexOf('      $("#customer-import").onclick=',start),code=html.slice(start,end);
 for(const role of ['sales','sales_manager','marketing','owner']){
  const calls=[],nodes=new Map();const $=selector=>{if(selector==='#customer-import-as-leads'&&role!=='sales')return null;if(!nodes.has(selector))nodes.set(selector,{onclick:null,click:()=>calls.push(selector),classList:{add:()=>{}}});return nodes.get(selector)};
  let modal='';const context=vm.createContext({profile:{role},canAccessView:()=>role==='sales',$,openDashboardModal:(title,body)=>modal=body});vm.runInContext(code,context);vm.runInContext('chooseCustomerImportKind()',context);
  assert.deepEqual(calls,[]);assert.match(modal,/已有客户档案/);
  if(role==='sales'){$('#customer-import-as-leads').onclick();assert.deepEqual(calls,['.nav[data-view="sales-lead-entry"]']);}else assert.doesNotMatch(modal,/id="customer-import-as-leads"/);
  $('#customer-import-as-records').onclick();assert.equal(calls.at(-1),'#customer-import-file');
 }
});
