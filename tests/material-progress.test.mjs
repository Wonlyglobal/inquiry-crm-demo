import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {materialProgress,progressAnswer,progressChart,progressIntent} from '../supabase/functions/agent-conversation/material-progress.mjs';
import {progressRows,progressBlock} from '../assets/agent-material-progress.mjs';
const now={status:'available',read_at:'2026-10-03T08:30:00Z',document_coverage:{total:131,ready:69,partial:22,processing:1,queued:29,failed:0,not_indexed:10},assets:[{id:'x',name:'secret.pdf'}]};
test('progress keeps counts only and is honest about what is not live',()=>{
 const p=materialProgress(now);assert.deepEqual(p.documents,{total:131,ready:69,partial:22,processing:1,queued:29,failed:0,not_indexed:10});
 assert.equal(p.products,null);assert.equal(p.videos,null);assert.doesNotMatch(JSON.stringify(p),/secret/);
 const a=progressAnswer(p);assert.match(a,/还没有全部理解/);assert.match(a,/读到文字的占 69%/);assert.match(a,/产品信息提取.*还没上线/);assert.match(a,/没有人工核验/);
 assert.equal(materialProgress({status:'unavailable',code:'http_403'}).status,'denied');assert.match(progressAnswer({status:'unavailable'}),/没连上/);
 const withAll=materialProgress({...now,document_coverage:{...now.document_coverage,semantic_processed:5,semantic_processing:1,semantic_partial:2,semantic_waiting:40,semantic_deferred:30},video_coverage:{total:855,ready:300,partial:5,processing:1,queued:549,failed:0,not_indexed:0}});
 assert.equal(withAll.products.waiting,40);assert.equal(withAll.videos.ready,300);assert.match(progressAnswer(withAll),/视频 855 条：采样解析完成 300/);
 assert.equal(progressChart(p).chart.bars.length,6);
});
test('questions about understanding progress are recognised',()=>{
 for(const q of ['grace每个资料都提取理解了吗','资料理解进度','视频解析了多少','物料都读完了吗'])assert.ok(progressIntent(q),q);
 for(const q of ['找一下沙特展会的视频','W-S1 的参数'])assert.equal(progressIntent(q),false,q);
});
test('live board block: bars per kind, pending rows explain why',()=>{
 const r=progressRows(materialProgress(now));assert.equal(r.rows[0].pct,69);assert.ok(r.rows[1].pending&&/进度未知/.test(r.rows[1].detail));assert.ok(r.rows[2].pending&&/内网/.test(r.rows[2].detail));
 assert.equal(progressRows(null).state,'loading');
 const all=[];const mk=t=>({tag:t,children:[],style:{},className:'',textContent:'',title:'',setAttribute(){},append(...c){this.children.push(...c)}});const doc={createElement:t=>{const n=mk(t);all.push(n);return n}};
 progressBlock(materialProgress(now),doc);assert.ok(all.some(n=>n.className==='mp-pct'&&n.textContent==='69%'));assert.ok(all.filter(n=>n.className==='mp-ready').length===1);
 const world=readFileSync(new URL('../assets/agent-world.mjs',import.meta.url),'utf8');assert.match(world,/selected==='Grace'&&'progress' in live/);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/action:'material-progress'/);assert.match(html,/Date\.now\(\)-materialProgressAt<300000/);
});

test('missing video statistics never assert a running worker',()=>{const p=materialProgress(now);assert.doesNotMatch(progressAnswer(p),/后台在逐条/);assert.match(progressAnswer(p),/无法确认后台是否正在运行/);});
