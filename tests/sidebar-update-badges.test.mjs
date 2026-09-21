import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function sidebarNotificationViews('),html.indexOf('      let sidebarRefreshInFlight'));
const counts=vm.runInNewContext(`${source}; sidebarUnreadCounts`);
test('assignment notifications route to the pool while assigned sales work routes to inquiries',()=>{
 const value=counts([{id:'1',type:'assignment_requested'},{id:'2',type:'inquiry_assigned',inquiry_id:'a',inquiries:{id:'a',excluded_from_dashboard:false}}]);
 assert.equal(value.assignment,1); assert.equal(value.inquiries,1); assert.equal(value['sales-today'],1);
});
test('read and duplicate notifications do not inflate badges',()=>{
 const item={id:'1',type:'customer_email_reply'};
 const value=counts([item,item,{id:'2',type:'customer_email_reply',read_at:'2026-09-21'}]);
 assert.equal(value.mailbox,1); assert.equal(value.communications,1);
});
test('independent business events map to their pages and unknown events stay on dashboard',()=>{
 const value=counts(['quotation_review_requested','public_pool_claim_requested','risk_case_opened','followup_reminder','knowledge_updated','unknown'].map((type,id)=>({id,type})));
 for(const view of ['quotes','public-pool','risk-review','follow-calendar','knowledge','dashboard'])assert.equal(value[view],1);
});

const group=vm.runInNewContext(`${source}; groupInquiryUpdates`);
test('inquiry badge counts accessible inquiries once and sorts their update reasons newest first',()=>{
 const base={inquiry_id:'a',inquiries:{id:'a',excluded_from_dashboard:false}};
 const items=[{...base,id:'1',created_at:'2026-09-20'},{...base,id:'2',created_at:'2026-09-21'}];
 assert.equal(counts(items).inquiries,1);
 assert.equal(group(items).get('a')[0].id,'2');
 assert.equal(group([...items,items[0]]).get('a').length,2);
});
test('read, hidden, inaccessible and unlinked notifications do not create inquiry markers',()=>{
 const items=[{id:'1',inquiry_id:'a',inquiries:null},{id:'2'},
 {id:'3',inquiry_id:'b',inquiries:{id:'b',excluded_from_dashboard:true}},
 {id:'4',inquiry_id:'c',read_at:'2026-09-21',inquiries:{id:'c'}}];
 assert.equal(group(items).size,0);
});
test('opening an inquiry acknowledges only the captured IDs for the current recipient',async()=>{
 const calls=[];
 const query={};
 for(const name of ['update','eq','is','in'])query[name]=(...args)=>{calls.push([name,...args]);return query};
 const acknowledge=vm.runInNewContext(`${source}; acknowledgeInquiryUpdates`,{
 profile:{id:'user'},supabase:{from:()=>query},loadNotifications:async()=>calls.push(['refresh']),toast:()=>{}});
 await acknowledge('a',[{id:'old-1'},{id:'old-2'}],'user');
 assert.equal(JSON.stringify(calls.find(call=>call[0]==='in')),JSON.stringify(['in','id',['old-1','old-2']]));
 assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='recipient_id'&&call[2]==='user'));
 const length=calls.length;
 await acknowledge('a',[{id:'old-1'}],'another-user');
 assert.equal(calls.length,length);
});
