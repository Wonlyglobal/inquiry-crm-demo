import test from 'node:test';import assert from 'node:assert/strict';
import {weeklyCheckDetails,confirmedWeeklyReceipt} from '../assets/weekly-customer-review.mjs';
import {leadWorkspaceHref} from '../assets/lead-workspace-route.mjs';
import {weeklyCustomerElements,divisionReportMessage} from '../supabase/functions/_shared/lead-report-card.mjs';
test('business-user entry goes to registration while supervisory views go to the board',()=>{
 assert.equal(leadWorkspaceHref('sales'),'sales-leads.html#entry');for(const role of ['owner','marketing','sales_manager'])assert.equal(leadWorkspaceHref(role),'sales-leads.html#lead-dashboard');
});
test('explicit unknown values are null, never invented dates or zero amounts',()=>{
 const Native=globalThis.FormData;globalThis.FormData=class{constructor(){return [['last_contact_on','2026-10-28'],['followup_result','  Actual checked result  '],['next_action','stale unsaved text']][Symbol.iterator]()}[Symbol.iterator](){return this}};
 try{const result=weeklyCheckDetails({elements:{unknown_last_contact_on:{checked:false},unknown_followup_result:{checked:false},unknown_next_action:{checked:true}}});assert.equal(result.last_contact_on,'2026-10-28');assert.equal(result.followup_result,'Actual checked result');assert.equal(result.next_action,null);assert.deepEqual(result.unknown_fields,['next_action']);assert.equal(Object.hasOwn(result,'estimated_amount'),false)}finally{globalThis.FormData=Native}
});
test('weekly customer table contains five bounded count columns and excludes private field values',()=>{
 const elements=weeklyCustomerElements({deadline_at:'2026-10-30T09:00Z',people:[{sales_id:'a',full_name:'模拟业务员',total:2,reviewed:1,pending:1,unknown_fields:3,rate:50,estimated_amount:987654,followup_result:'PRIVATE FOLLOWUP'},{sales_id:'b',full_name:'模拟空名单',total:0,reviewed:0,pending:0,unknown_fields:0,rate:null}]});
 const table=elements.find(e=>e.tag==='table');assert.equal(table.columns.length,5);assert.equal(table.columns.reduce((n,c)=>n+parseInt(c.width),0),100);assert.equal(table.rows[0].rate,'50%');assert.equal(table.rows[1].rate,'—');assert.equal(JSON.stringify(elements).includes('PRIVATE FOLLOWUP'),false);assert.equal(JSON.stringify(elements).includes('987654'),false);
 assert.match(elements[0].content,/17:00/);
});
test('invalid frozen metrics never become invented completion rows',()=>{
 assert.equal(weeklyCustomerElements({deadline_at:'2026-10-30T09:00Z',people:[]}).some(e=>e.tag==='table'),false);
 for(const p of [{total:0,reviewed:0,pending:0,unknown_fields:0,rate:0},{total:1,reviewed:2,pending:0,unknown_fields:0,rate:200}])assert.equal(weeklyCustomerElements({deadline_at:'2026-10-30T09:00Z',people:[{sales_id:'a',full_name:'模拟',...p}]}).some(e=>e.tag==='table'),false);
});
test('division weekly message stays a single card while adding the frozen customer table',()=>{
 const body='【事业部线索与商机周榜】2026-10-26—2026-10-30\n全员1人 · 新增1条 · 转商机1条\n1. 模拟业务员：转商机1条 / 新增1条 / 跟进1次 / 无新增申报0人天 / 未提交0人天 / 不足目标0人天\nhttps://crm.foreverdoodle.com/sales-leads.html';
 const result=divisionReportMessage(body,{customer_updates:{deadline_at:'2026-10-30T09:00Z',people:[{sales_id:'a',full_name:'模拟业务员',total:2,reviewed:1,pending:1,unknown_fields:1,rate:50}]}});
 assert.equal(result.msg_type,'interactive');assert.equal(result.card.body.elements.filter(e=>e.tag==='table').length,2);
 assert.match(result.card.body.elements.find(e=>e.content?.startsWith('客户与商机')).content,/17:00/);
});

test('save receipt alone or a different visible version never claims readback success',()=>{
 const receipt={id:'saved-one'};assert.equal(confirmedWeeklyReceipt(receipt,null),false);assert.equal(confirmedWeeklyReceipt(receipt,{items:[]}),false);assert.equal(confirmedWeeklyReceipt(receipt,{items:[{last_check:{id:'different'}}]}),false);assert.equal(confirmedWeeklyReceipt(receipt,{items:[{last_check:{id:'saved-one'}}]}),true);
});
