import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function sidebarNotificationViews('),html.indexOf('      let sidebarRefreshInFlight'));
const counts=vm.runInNewContext(`${source}; sidebarUnreadCounts`);
test('assignment notifications route to the pool while assigned sales work routes to inquiries',()=>{
 const value=counts([{id:'1',type:'assignment_requested'},{id:'2',type:'inquiry_assigned'}]);
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
