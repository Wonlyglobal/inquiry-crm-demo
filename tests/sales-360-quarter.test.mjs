import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function sales360QuarterKey('),html.indexOf('      function openSales360PersonEvaluation('));
const {key,rows,quarters,memberTasks}=vm.runInNewContext(`${source}; ({key:sales360QuarterKey,rows:sales360QuarterRows,quarters:sales360AvailableQuarters,memberTasks:sales360MemberTasks})`);
test('quarters group month boundaries and years without converting monthly periods',()=>{
 assert.equal(key('2026-03-01'),'2026-Q1'); assert.equal(key('2026-04-01'),'2026-Q2');
 assert.equal(key('2027-01-01'),'2027-Q1');
});
test('quarter matrix distinguishes pending, submitted, unassigned and missing periods',()=>{
 const people=[{id:'a'},{id:'b'}];
 const tasks=[{subject_id:'a',period_start:'2026-07-01',status:'pending'},
 {subject_id:'a',period_start:'2026-08-01',status:'submitted'},
 {subject_id:'b',period_start:'2026-06-01',status:'submitted'}];
 const result=rows(people,tasks,[{period_start:'2026-07-01',status:'collecting',evaluation_due_at:'2099-01-01'},{period_start:'2026-08-01',status:'collecting',evaluation_due_at:'2099-01-01'}],'2026-Q3',{},'2026-09');
 assert.equal(JSON.stringify(result[0].months.map(x=>x.status)),JSON.stringify(['待评价','已提交','月份未结束']));
 assert.equal(JSON.stringify(result[1].months.map(x=>x.status)),JSON.stringify(['非本人评价范围','非本人评价范围','月份未结束']));
 assert.equal(result.length,2);
});

test('person scoring entry opens month choices and only offers assigned pending evaluations',()=>{
 const personSource=html.slice(html.indexOf('      function openSales360PersonEvaluation('),html.indexOf('      function renderSales360QuarterPanel('));
 let rendered='';
 const open=vm.runInNewContext(`${personSource}; openSales360PersonEvaluation`,{esc:String,openDashboardModal:(title,body)=>{rendered=title+body},$:()=>({querySelectorAll:()=>[]})});
 open({person:{full_name:'示例业务员'},months:[{month:'2026-07',status:'月份未结束'},{month:'2026-08',status:'已提交',task:{assignment_id:'done'}},{month:'2026-09',status:'待评价',task:{assignment_id:'pending'}}]},'2026-Q3');
 assert.match(rendered,/给 示例业务员 评分/);
 assert.match(rendered,/data-person-evaluate="2026-09"/);
 assert.doesNotMatch(rendered,/data-person-evaluate="2026-08"/);
 assert.match(rendered,/月末结束后可评价/);
});

test('manager can open same-team completed months without a cycle, but not another team or current month',()=>{
 const result=rows([{id:'a',team:'A'},{id:'b',team:'B'}],[],[],'2026-Q3',{role:'sales_manager',team:'销售部',managedTeams:['A']},'2026-09');
 assert.equal(result[0].months[0].status,'待评价');
 assert.equal(result[0].months[0].task.direct,true);
 assert.equal(result[0].months[0].task.evaluator_group,'manager');
 assert.equal(result[0].months[2].status,'月份未结束');
 assert.equal(result[1].months[0].status,'非本人评价范围');
});

test('manager quarterly rows use explicit multiple teams and fail closed without scope',()=>{
 const people=[{id:'a',team:'A'},{id:'b',team:'B'},{id:'c',team:'C'}];
 const result=rows(people,[],[],'2026-Q3',{role:'sales_manager',team:'销售部',managedTeams:['A','B']},'2026-09');
 assert.deepEqual(Array.from(result,row=>row.months[0].status),['待评价','待评价','非本人评价范围']);
 assert.equal(rows(people,[],[],'2026-Q3',{role:'sales_manager',team:'A'},'2026-09')[0].months[0].status,'非本人评价范围');
});

test('evaluation quarters start at 2026 Q3 and use all subsequent quarters',()=>{
 assert.deepEqual(Array.from(quarters('2026-09')),['2026-Q3']);
 assert.deepEqual(Array.from(quarters('2027-02')),['2027-Q1','2026-Q4','2026-Q3']);
 assert.deepEqual(Array.from(quarters('2026-06')),[]);
 assert.equal(rows([{id:'a',team:'A'}],[],[],'2026-Q2',{role:'owner'},'2026-09')[0].months[0].status,'尚未启用评价');
});
test('13 members yield 26 actionable tasks for July and August, not unfinished September',()=>{
 const people=Array.from({length:13},(_,i)=>({id:String(i),full_name:String(i),team:'A'}));
 const actor={role:'sales_manager',managedTeams:['A']};
 const result=memberTasks(people,[],[],actor,'2026-09');
 assert.equal(result.length,26);
 assert.ok(result.every(t=>['2026-07-01','2026-08-01'].includes(t.period_start)));
 assert.equal(memberTasks(people,result,[],actor,'2026-09').length,26);
 assert.equal(memberTasks(people,[],[],{role:'sales_manager',managedTeams:[]},'2026-09').length,0);
 const existing={subject_id:'0',period_start:'2026-07-01',status:'submitted',evaluator_group:'manager'};
 const updated=memberTasks(people,[existing],[],actor,'2026-09');
 assert.equal(updated.filter(t=>t.status==='pending').length,25);
 assert.equal(updated.filter(t=>t.subject_id==='0'&&t.period_start==='2026-07-01').length,1);
});

test('expired existing evaluations do not inflate pending member task counts',()=>{
 const tasks=[{subject_id:'a',period_start:'2026-07-01',status:'pending',evaluator_group:'manager',due_at:'2020-01-01'}];
 const result=memberTasks([{id:'a',team:'A'}],tasks,[],{role:'sales_manager',managedTeams:['A']},'2026-09');
 assert.equal(result.find(t=>t.period_start==='2026-07-01').status,'expired');
 assert.equal(result.filter(t=>t.status==='pending').length,1);
});
