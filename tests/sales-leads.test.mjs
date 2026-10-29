import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dailyState,summarize,localDay,importRows,leadRequestMessage} from '../assets/sales-leads.mjs';
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
test('new importer pins authoritative current parser and rejects oversized sheets without formula parsing',()=>{
 const page=readFileSync(new URL('../assets/sales-leads-page.mjs',import.meta.url),'utf8');
 assert.match(page,/cdn\.sheetjs\.com\/xlsx-0\.20\.3\/package\/xlsx\.mjs/);assert.doesNotMatch(page,/xlsx@0\.18/);
 assert.doesNotMatch(page,/sheetRows:202/);assert.match(page,/cellFormula:false/);assert.match(page,/leadWorksheetRecords\(X,book.Sheets/);
});

test('unknown contacts remain blank and do not block real lead entry',()=>{
 const r={company:'模拟公司',country:'Ghana',email:'—',phone:'暂无',contact:'—',source:'outbound',demand:'待跟进门类需求',acquired_on:'2026-10-28'};
 const out=importRows([r])[0];assert.equal(out.email,'');assert.equal(out.phone,'');assert.equal(out.contact,'');
});
test('import reports exact rows and fields before any submission',()=>{
 const r={company:'模拟公司',country:'Ghana',email:'a@example.com',phone:'',source:'outbound',demand:'待跟进门类需求',acquired_on:'2026-10-28'};
 assert.throws(()=>importRows([r,{...r,email:'54'},{...r,email:'a@example.com; b@example.com'},{...r,country:'',acquired_on:'2026-02-31'}]),e=>/第3行：邮箱格式/.test(e.message)&&/第4行：邮箱格式/.test(e.message)&&/第5行：国家未填写/.test(e.message)&&/获取日期/.test(e.message));
});
test('transport errors are not presented as field validation or confirmed success',()=>{
 assert.match(leadRequestMessage(Error('TypeError: Load failed')),/尚未确认保存结果/);
 assert.match(leadRequestMessage(Error('第15行：国家未填写')),/第15行：国家未填写/);
});
test('customer template maps to daily leads, preserves extra information and requires a real acquisition date',()=>{
 const r={'公司名称':'合成客户','联系人':'测试人','国家/地区':'测试地区','客户邮箱':'a@example.com','WhatsApp':'+12345','来源渠道':'表格导入','需求摘要':'门锁','产品品类':'智能锁','预计采购日期':'2026-12-01'};
 assert.throws(()=>importRows([r]),/获取日期/);
 const out=importRows([r],{acquiredOn:'2026-10-28'})[0];
 assert.equal(out.company,'合成客户');assert.equal(out.country,'测试地区');assert.equal(out.phone,'+12345');assert.equal(out.source,'other');assert.equal(out.acquired_on,'2026-10-28');
 assert.match(out.demand,/原获客渠道：表格导入/);assert.match(out.demand,/需求记录：门锁/);assert.match(out.demand,/预计采购日期（原文件）：2026-12-01/);
 assert.equal(importRows([{...r,'获取日期':'2026-10-01'}],{acquiredOn:'2026-10-28'})[0].acquired_on,'2026-10-01');
 assert.equal(r['需求摘要'],'门锁');assert.ok(!Object.hasOwn(r,'获取日期'));
 assert.throws(()=>importRows([r],{acquiredOn:'2026-02-31'}),/获取日期/);
});
test('date completion revalidates the retained file and never submits automatically',()=>{
 const page=readFileSync(new URL('../assets/sales-leads-page.mjs',import.meta.url),'utf8');
 const handler=page.slice(page.indexOf("$('#import-acquired-on').onchange"),page.indexOf("$('#excel').onchange"));
 assert.match(handler,/previewLeadRecords/);assert.doesNotMatch(handler,/rpc\(/);
 assert.match(page,/decodeCustomerCsv\(bytes\)/);assert.match(page,/importRecords=\[\]/);
 const html=readFileSync(new URL('../sales-leads.html',import.meta.url),'utf8');assert.match(html,/id="import-acquired-on" type="date"/);assert.doesNotMatch(html,/id="import-acquired-on"[^>]*value=/);
});
