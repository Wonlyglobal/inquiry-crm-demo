import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stageNames,leadStageLabel,formatStageSummary} from '../assets/sales-lead-stages.mjs';

test('all inquiry enum stages use the existing main CRM Chinese terminology',()=>{
 const main=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const block=main.match(/const statusNames = \{([\s\S]*?)\};/)[1];
 const authoritative=Object.fromEntries([...block.matchAll(/(\w+): "([^"]+)"/g)].map(m=>[m[1],m[2]]));
 const schema=readFileSync(new URL('./fixtures/manager-scope-schema.sql',import.meta.url),'utf8');
 const stages=[...schema.match(/create type public\.inquiry_status as enum \(([^;]+)\)/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual(stageNames,authoritative);
 assert.deepEqual(Object.keys(stageNames),stages);
 for(const stage of stages)assert.equal(leadStageLabel({inquiry_id:'linked',stage}),authoritative[stage]);
 assert.ok(Object.isFrozen(stageNames));
});

test('unconverted and linked but unavailable stages are distinct',()=>{
 assert.equal(leadStageLabel(),'尚未转化');
 assert.equal(leadStageLabel({inquiry_id:null,stage:'received'}),'尚未转化');
 for(const stage of [null,undefined,''])assert.equal(leadStageLabel({inquiry_id:'linked',stage}),'阶段暂不可用');
});

test('unknown and prototype stages never leak enum or markup',()=>{
 for(const stage of ['future_stage','constructor','__proto__','toString','<img onerror=alert(1)>']){
  assert.equal(leadStageLabel({inquiry_id:'linked',stage}),'阶段待核实');
 }
});

test('weekly stage labels preserve all counts including zero without changing the snapshot',()=>{
 const stages=Object.freeze(Object.fromEntries(Object.keys(stageNames).map((key,i)=>[key,i])));
 const before=JSON.stringify(stages);
 assert.equal(formatStageSummary(stages),Object.values(stageNames).map((label,i)=>`${label}：${i} 个`).join('、'));
 assert.equal(JSON.stringify(stages),before);
});

test('weekly unknown keys are safely grouped without losing counts',()=>{
 const stages=JSON.parse('{"future_stage":2,"constructor":3,"__proto__":4,"<script>":5,"received":1}');
 assert.equal(formatStageSummary(stages),'收到询盘：1 个、阶段待核实：14 个');
});

test('empty snapshots have a Chinese empty state, not raw JSON',()=>{
 for(const stages of [{},null,undefined])assert.equal(formatStageSummary(stages),'暂无商机阶段数据');
});

test('malformed stage payloads are flagged instead of invented counts',()=>{
 for(const stages of ['received',[],1,true])assert.equal(formatStageSummary(stages),'阶段数据待核对');
 for(const count of [-1,1.5,'3',null,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  assert.equal(formatStageSummary({received:2,won:count}),'收到询盘：2 个、部分阶段数据待核对');
 }
 assert.equal(formatStageSummary({unknown_a:Number.MAX_SAFE_INTEGER,unknown_b:1}),'阶段待核实：9007199254740991 个、部分阶段数据待核对');
});

test('both daily lead render paths use Chinese helpers and HTML invalidates the old page cache',()=>{
 const page=readFileSync(new URL('../assets/sales-leads-page.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../sales-leads.html',import.meta.url),'utf8');
 assert.match(page,/esc\(leadStageLabel\(l\)\)/);
 assert.match(page,/formatStageSummary\(w\.summary\.stages\)/);
 assert.doesNotMatch(page,/JSON\.stringify\(w\.summary\.stages\)|esc\(l\.stage/);
 assert.match(html,/sales-leads-page\.mjs\?v=20261028-report-timeliness-1/);
});
