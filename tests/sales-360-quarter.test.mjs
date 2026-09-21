import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function sales360QuarterKey('),html.indexOf('      function openSales360PersonEvaluation('));
const {key,rows}=vm.runInNewContext(`${source}; ({key:sales360QuarterKey,rows:sales360QuarterRows})`);
test('quarters group month boundaries and years without converting monthly periods',()=>{
 assert.equal(key('2026-03-01'),'2026-Q1'); assert.equal(key('2026-04-01'),'2026-Q2');
 assert.equal(key('2027-01-01'),'2027-Q1');
});
test('quarter matrix distinguishes pending, submitted, unassigned and missing periods',()=>{
 const people=[{id:'a'},{id:'b'}];
 const tasks=[{subject_id:'a',period_start:'2026-07-01',status:'pending'},
 {subject_id:'a',period_start:'2026-08-01',status:'submitted'},
 {subject_id:'b',period_start:'2026-06-01',status:'submitted'}];
 const result=rows(people,tasks,[{period_start:'2026-07-01'},{period_start:'2026-08-01'}],'2026-Q3');
 assert.equal(JSON.stringify(result[0].months.map(x=>x.status)),JSON.stringify(['待评价','已提交','未建周期']));
 assert.equal(JSON.stringify(result[1].months.map(x=>x.status)),JSON.stringify(['未分配给我','未分配给我','未建周期']));
 assert.equal(result.length,2);
});

test('person scoring entry opens month choices and only offers assigned pending evaluations',()=>{
 const personSource=html.slice(html.indexOf('      function openSales360PersonEvaluation('),html.indexOf('      function renderSales360QuarterPanel('));
 let rendered='';
 const open=vm.runInNewContext(`${personSource}; openSales360PersonEvaluation`,{esc:String,openDashboardModal:(title,body)=>{rendered=title+body},$:()=>({querySelectorAll:()=>[]})});
 open({person:{full_name:'示例业务员'},months:[{month:'2026-07',status:'未建周期'},{month:'2026-08',status:'已提交',task:{assignment_id:'done'}},{month:'2026-09',status:'待评价',task:{assignment_id:'pending'}}]},'2026-Q3');
 assert.match(rendered,/给 示例业务员 评分/);
 assert.match(rendered,/data-person-evaluate="pending"/);
 assert.doesNotMatch(rendered,/data-person-evaluate="done"/);
 assert.match(rendered,/尚未创建评分周期/);
});
