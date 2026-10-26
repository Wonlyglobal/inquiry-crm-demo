import test from 'node:test';import assert from 'node:assert/strict';
import {dailyState,summarize,localDay,importRows} from '../assets/sales-leads.mjs';
test('Shanghai day does not depend on browser timezone',()=>{assert.equal(localDay(new Date('2026-10-25T16:01:00Z')),'2026-10-26')});
const day={sales_id:'s',day:'2026-10-26',daily_min:1};
const lead={id:'a',sales_id:'s',recorded_on:day.day,acquired_on:'2026-08-01',inquiry_id:'i',converted_at:'2026-10-26T09:00:00Z'};
test('late entries count by immutable recorded date; zero declaration is not a lead',()=>{
 assert.equal(dailyState(day,[]).status,'missing');assert.equal(dailyState({...day,no_new_reason:'拜访调研无新增'},[]).status,'no_new');
 assert.equal(dailyState({...day,no_new_reason:'历史申报'},[lead]).status,'complete');assert.equal(dailyState({...day,exempt_reason:'法定休假'},[]).status,'exempt');
 assert.equal(dailyState({...day,weekend:true},[]).status,'weekend');assert.equal(dailyState({...day,daily_min:2},[lead]).status,'short');
 assert.equal(dailyState(day,[lead,lead]).count,1);
});
test('cohort ratio and period conversions use different denominators',()=>{
 const old={...lead,id:'b',inquiry_id:'i2',recorded_on:'2026-08-01'},data={leads:[lead,old],days:[day]};
 const s=summarize(data,'s',day.day,day.day);assert.equal(s.leads,1);assert.equal(s.conversionRate,100);assert.equal(s.periodConversions,2);assert.equal(s.missing,0);
 assert.equal(summarize(data,'other',day.day,day.day).conversionRate,null);
});
test('Excel input is explicit, bounded and requires acquisition date',()=>{
 const r={'客户名称':'合成客户','国家':'合成地区','邮箱':'test@example.com','来源':'自主开发','需求简述':'合成门类需求','获取日期':'2026-10-26'};
 assert.equal(importRows([r])[0].source,'outbound');assert.throws(()=>importRows([{...r,'获取日期':''}]));assert.throws(()=>importRows(Array(201).fill(r)));assert.throws(()=>importRows([]));
});
