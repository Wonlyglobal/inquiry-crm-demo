import test from 'node:test';import assert from 'node:assert/strict';
import {crmStatsChart,intelChart} from '../supabase/functions/agent-conversation/data-charts.mjs';
import {windowsFrom,storable,dataChart} from '../assets/agent-timeline.mjs';
const crm={status:'available',lead_count:40,period:{start:'2026-09-01T00:00:00Z',end:'2026-10-01T00:00:00Z'},channels:[{label:'website',count:20},{label:'email',count:12},{label:'other_or_unknown',count:8}],countries:[{label:'MX',count:15},{label:'SA',count:9}],stages:[{label:'quoted',count:7}]};
test('CRM stats chart: picks the dimension asked, names the source, only allowed aggregates',()=>{
 const a=crmStatsChart('最近各渠道询盘多少',crm);assert.equal(a.type,'data_chart');assert.deepEqual(a.chart.bars.map(b=>b.label),['官网','邮件','其他/未知']);
 assert.match(a.chart.sources[0].label,/CRM 询盘表/);assert.match(a.chart.sources[0].detail,/2026-09-01 至 2026-10-01/);
 assert.deepEqual(crmStatsChart('哪个国家询盘多',crm).chart.bars.map(b=>b.label),['墨西哥','沙特']);
 assert.equal(crmStatsChart('写一封开发信',crm),null);assert.equal(crmStatsChart('渠道多少',{status:'insufficient_sample'}),null);
});
test('intel chart: count per company, each bar links to that company latest item',()=>{
 const c=intelChart({last_run:{started_at:'2026-10-01T08:00:00Z'},items:[{company:'NAFFCO（阿联酋）',kind:'news',url:'https://n/1'},{company:'NAFFCO（阿联酋）',kind:'news',url:'https://n/2'},{company:'JELD-WEN（英国）',kind:'video',url:'https://y/1'},{company:'X',kind:'evidence_changed',url:'https://x'}]});
 assert.deepEqual(c.chart.bars.map(b=>[b.label,b.value]),[['NAFFCO',2],['JELD-WEN',1]]);assert.equal(c.chart.bars[0].url,'https://n/1');assert.match(c.chart.sources[0].label,/YouTube/);
 assert.equal(intelChart({items:[]}),null);
 const [w]=windowsFrom({actions:[c]});assert.equal(w.kind,'chart');assert.equal(storable(w),null,'intel charts are not stored');
});
test('generic chart renders bars, units, sources and survives bad urls',()=>{
 const all=[];const mk=tag=>({tag,children:[],style:{},dataset:{},className:'',textContent:'',append(...c){this.children.push(...c)}});const doc={head:mk('head'),createElement:t=>{const n=mk(t);all.push(n);return n},getElementById:()=>null};
 dataChart({title:'T',unit:'条',bars:[{label:'a',value:3},{label:'b',value:0,url:'javascript:x'}],sources:[{label:'S',detail:'d'}]},doc);
 const bars=all.filter(n=>n.className==='gt-bar');assert.equal(bars.length,2);assert.ok(bars.every(b=>b.tag==='div'));
 assert.ok(all.some(n=>n.className==='gt-bv'&&n.textContent==='3 条'));assert.ok(all.some(n=>n.textContent==='S'));
 const empty=[];const d2={...doc,createElement:t=>{const n=mk(t);empty.push(n);return n}};dataChart({bars:[]},d2);assert.ok(empty.some(n=>/没有可画/.test(n.textContent)));
});
