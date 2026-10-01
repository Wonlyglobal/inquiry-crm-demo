import test from 'node:test';import assert from 'node:assert/strict';
import {priceGroups,priceChartActions,priceAnswer,priceIntent} from '../supabase/functions/agent-conversation/competitor-brief.mjs';
import {timelineWindow,expandTimeline} from '../supabase/functions/agent-conversation/request-timeline.mjs';
import {windowsFrom,storable,priceChart} from '../assets/agent-timeline.mjs';

function fakeDoc(){const all=[];const mk=tag=>({tag,children:[],style:{},dataset:{},className:'',textContent:'',append(...c){this.children.push(...c)}});
 return {head:mk('head'),createElement:t=>{const n=mk(t);all.push(n);return n},getElementById:()=>null,all};}

test('price groups: sorted bars, each bar keeps its official https source',()=>{
 const [g]=priceGroups(priceIntent('墨西哥智能锁竞品价格'));
 assert.equal(g.market,'MX');assert.equal(g.currency,'墨西哥比索');
 assert.deepEqual(g.bars.map(b=>b.price),[...g.bars.map(b=>b.price)].sort((a,b)=>a-b));
 assert.ok(g.bars.every(b=>/^https:\/\//.test(b.url)&&b.source));
 assert.equal(g.min,g.bars[0].price);assert.equal(g.max,g.bars.at(-1).price);
});
test('price answer names its sources per row and per group',()=>{
 const a=priceAnswer(priceIntent('墨西哥智能锁竞品价格'));
 assert.match(a,/｜tiendaassaabloy\.com/);assert.match(a,/来源：.*kaadasmexico\.com（凯迪仕 Kaadas）/);assert.match(a,/柱状图/);
});
test('chart action -> timeline window -> stored descriptor -> expanded again on the server',()=>{
 const [a]=priceChartActions(priceIntent('沙特飞利浦智能锁多少钱'));
 assert.equal(a.type,'price_chart');assert.ok(a.chart.bars.length>=5);
 const [w]=windowsFrom({actions:[a]});assert.equal(w.kind,'chart');
 const stored=timelineWindow(storable(w));assert.deepEqual(Object.keys(stored).sort(),['category','companies','kind','label','market']);
 assert.equal(timelineWindow({kind:'chart',market:'mx',category:'smart_lock'}),null);
 assert.equal(timelineWindow({kind:'chart',market:'MX',category:'nope'}),null);
 assert.deepEqual(timelineWindow({kind:'chart',market:'MX',category:'smart_lock',companies:['<script>','凯迪仕 Kaadas（中国出海）']}).companies,['凯迪仕 Kaadas（中国出海）']);
 const [row]=expandTimeline([{windows:[stored]}]);assert.equal(row.windows[0].chart.bars.length,a.chart.bars.length);
 assert.equal(expandTimeline([{windows:[{kind:'chart',market:'AE',category:'fire_door',companies:[]}]}])[0].windows.length,0,'no data -> dropped');
});
test('chart DOM: one bar per price, links only to https sources, sources listed',()=>{
 const [a]=priceChartActions(priceIntent('墨西哥智能锁竞品价格'));const doc=fakeDoc();
 const box=priceChart(a.chart,doc);assert.equal(box.className,'gt-chart');
 const bars=doc.all.filter(n=>n.className==='gt-bar');assert.equal(bars.length,a.chart.bars.length);
 assert.ok(bars.every(b=>b.tag==='a'&&/^https:\/\//.test(b.href)&&b.rel==='noopener noreferrer'));
 const widths=doc.all.filter(n=>n.className==='gt-bf').map(n=>parseInt(n.style.width));assert.equal(Math.max(...widths),100);
 assert.ok(doc.all.some(n=>n.tag==='style'),'chart carries its own CSS');
 const bad=priceChart({...a.chart,bars:[{...a.chart.bars[0],url:'javascript:alert(1)'}]},fakeDoc());assert.ok(bad);
});
