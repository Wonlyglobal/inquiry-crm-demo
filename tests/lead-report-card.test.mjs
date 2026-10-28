import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {divisionReportMessage} from '../supabase/functions/_shared/lead-report-card.mjs';
const daily=(count=2)=>`【事业部每日线索排行榜】2026-10-28 截止18:00（北京时间）\n全员${count}人｜新增1条｜当日转商机0条\n达标1人｜无新增申报0人｜未提交1人｜未达标0人｜豁免0人\n\n`+Array.from({length:count},(_,i)=>`${i?2:1}. 合成员${i}（海外业务部）：新增${i?0:1}条 / 转商机0条 · ${i?'未提交':'达标'}`).join('\n');
test('native daily table preserves full roster including zero and ties, with one message and no narrative',()=>{
 const msg=divisionReportMessage(daily(13),{timeliness:[{full_name:'合成员0',expected:2,on_time:1,rate:50,late:1,missing:0,pending:0,key_progress:'PRIVATE'}]});
 assert.equal(msg.msg_type,'interactive');assert.equal(msg.card.schema,'2.0');
 const table=msg.card.body.elements.find(e=>e.tag==='table');assert.equal(table.rows.length,13);assert.equal(table.page_size,10);
 assert.equal(table.rows[0].on_time,'50%');assert.equal(table.rows[12].rank,'2');assert.equal(table.rows[12].new_leads,'0');
 assert.match(msg.card.body.elements.find(e=>e.content?.startsWith('补充核对')).content,/线索未申报/);assert.equal(table.rows[12].on_time,'—');assert.doesNotMatch(JSON.stringify(msg),/PRIVATE/);
});
test('weekly table preserves conversion-first stored order and separates lead missing from report missing',()=>{
 const body='【事业部线索与商机周榜】2026-10-26—2026-10-30（北京时间）\n全员1人｜新增2条｜本周转商机3条\n\n1. 合成员：转商机3条 / 新增2条 / 跟进4次 / 无新增申报1人天 / 未提交2人天 / 不足目标0人天';
 const msg=divisionReportMessage(body,{timeliness:[{full_name:'合成员',expected:0,on_time:0,rate:null,late:0,missing:0,pending:1}]});const table=msg.card.body.elements.find(e=>e.tag==='table');
 assert.equal(table.rows[0].converted,'3');assert.equal(table.rows[0].new_leads,'2');assert.equal(table.rows[0].on_time,'—');assert.match(msg.card.body.elements.find(e=>e.content?.startsWith('补充核对')).content,/待截止1/);
});
test('unknown, malformed, count-mismatched snapshots use compatible original text rather than invent rows',()=>{
 for(const body of ['Legacy snapshot',daily().replace('全员2人','全员3人'),daily().replace('新增1条 /','新增未知 /')])assert.equal(divisionReportMessage(body).msg_type,'text');
});
test('sidebar includes direct grouped route and deadline inputs use separate scoped RPC',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/data-view="sales-leads" href="sales-leads.html#lead-dashboard"/);assert.match(html,/views:\["dashboard","sales-leads"/);
 const page=readFileSync(new URL('../sales-leads.html',import.meta.url),'utf8');assert.match(page,/id="lead-dashboard"/);assert.match(page,/id="report-deadline-form"/);assert.match(page,/sales-leads-page.mjs\?v=20261028-report-timeliness-1/);assert.match(html,/daily-report-ui.mjs\?v=20261028-flow1/);
});


test('five compact columns fill the canvas without auto widths and keep rates readable',()=>{
 const msg=divisionReportMessage(daily(13),{timeliness:[{full_name:'合成员0',expected:3,on_time:1,rate:33.3,late:2,missing:0,pending:0}]});
 const table=msg.card.body.elements.find(e=>e.tag==='table');
 assert.deepEqual(table.columns.map(c=>c.display_name),['排名','业务员','线索数','商机数','按时提交率']);
 assert.equal(table.columns.reduce((sum,c)=>sum+parseInt(c.width),0),100);
 assert.ok(table.columns.every(c=>/^\d+%$/.test(c.width)));
 assert.equal(table.row_height,'auto');assert.equal(table.header_style.lines,2);
 assert.deepEqual(Object.keys(table.rows[0]),['rank','person','new_leads','converted','on_time']);
 assert.equal(table.rows[0].person,'合成员0');assert.equal(table.rows[0].on_time,'33.3%');
 assert.equal(table.rows.length,13);assert.match(msg.card.body.elements.find(e=>e.content?.startsWith('补充核对')).content,/按时 1\/3 · 33.3%/);
});
