import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const world=await readFile(new URL('../assets/agent-world.mjs',import.meta.url),'utf8');
const src=html.slice(html.indexOf('      function worldLiveBoard(name){'),html.indexOf('      function enterAgentWorld(){'));
const D=86400000,now=Date.now(),iso=d=>new Date(now-d*D).toISOString();
const start=new Date(now-29*D);start.setHours(0,0,0,0);const end=new Date(now);end.setHours(23,59,59,999);
const ctx=(over={})=>({start,end,previousStart:new Date(start-30*D),previousEnd:new Date(start-1),scope:'全部',
 created:[{created_at:iso(2),source:'website',validity:'valid',target_country:'México'},{created_at:iso(5),source:'website',validity:'invalid',target_country:'México'},{created_at:iso(20),source:'website',validity:'valid'},{created_at:iso(25),source:'email',validity:'pending'}],
 previous:{created:Array.from({length:7},(_,i)=>({created_at:iso(35+i),source:i<6?'website':'email',validity:'valid'})),won:[{}],assigned:[1,2,3,4],fast:[1,2]},
 active:[{title:'A'},{title:'B'}],overdue:[{title:'Proforma',assigned_at:iso(1.1)},{title:'Other',assigned_at:iso(.5)}],risky:[],won:[{won_at:iso(3)}],assigned:[1,2,3],fast:[1],
 totalCny:52000,comparison:{totalCny:80000},salesStats:[{name:'Chloe',amount:52000,won:1}],...over});
const board=c=>new Function('aiDataContext','sourceNames','sumWonCny','dashboardHasSuccessfulLoad','agentDataRefreshFailed',src+';return worldLiveBoard;')(()=>c,{website:'官网表单',email:'企业邮箱'},r=>r.length*52000,true,false);

test('Grace live board compares with the previous 30 days and names the channel that dropped most',()=>{
 const b=board(ctx())('Grace');
 assert.equal(b.compare.startsWith('对比 '),true);
 assert.deepEqual(b.metrics[0],{code:'NEW',label:'新增询盘',value:'4',delta:{text:'↓43% · 上期 7',dir:'down',good:false},spark:[1,1,0,0,1,1]});
 assert.equal(b.metrics[1].value,'67%');
 assert.equal(b.conclusion.tone,'warn');
 assert.match(b.conclusion.text,/^官网表单比上期少 3 条（3 vs 6）/);
});
test('Brian conclusion points at the oldest overdue first response',()=>{
 const b=board(ctx())('Brian');
 assert.equal(b.metrics[1].value,'33%');
 assert.equal(b.metrics[3].delta.text,'与上期持平 · 上期 1');
 assert.match(b.conclusion.text,/^「Proforma」首响已超时 26 小时，先回复它；另有 1 条超时。$/);
 const calm=board(ctx({overdue:[]}))('Brian');
 assert.equal(calm.conclusion.tone,'ok');
});
test('Jay conclusion states revenue change and top contributor, or that nothing closed',()=>{
 assert.match(board(ctx())('Jay').conclusion.text,/较上期下降 35%；贡献最大的是 Chloe/);
 const none=board(ctx({won:[],totalCny:0,salesStats:[]}))('Jay');
 assert.match(none.conclusion.text,/^近 30 天没有成交/);
});
test('live board renders deltas, sparkline and conclusion instead of connection pills',()=>{
 assert.match(world,/live-delta/);assert.match(world,/live-spark/);assert.match(world,/live-conclusion/);
 assert.doesNotMatch(world,/live-sources/);
});
