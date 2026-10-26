import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMarketMaterials} from '../supabase/functions/agent-conversation/product-market.mjs';
import {materialQuery} from '../supabase/functions/agent-conversation/document-knowledge.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';

const model='QX880 PRO',ordinary=model+'智能锁V8越南市场分析';
const asset=(id,{sha='a',version='V8',pages=[1]}={})=>({id:String(id),name:'Synthetic document',versionLabel:version,isCurrentVersion:true,updatedAt:'2026-10-26',document:{status:'ready',sha256:sha.repeat(64),pages_total:20,pages:pages.map(page=>({page,chunks:[],facts:[]})),product_understanding:{status:'ready',findings:[]}}});
const rows=(start,count)=>Array.from({length:count},(_,i)=>asset(start+i));
const response=(assets,has_more,match_total)=>({status:'available',assets,has_more,match_total});
const pageOf=q=>Number(q.match(/第(\d+)页$/)?.[1]);
const source=r=>r.source_lookups[0];
const lookup=load=>loadMarketMaterials(ordinary,model,null,load);

test('ordinary pagination retains the complete model and edition, and stops at the last page',async()=>{
 const calls=[];
 const result=await lookup(async q=>{
  calls.push(q);const parsed=materialQuery(q),page=pageOf(q);
  assert.equal(parsed.page,page);assert.equal(parsed.constraints.version,'V8');
  assert.deepEqual(parsed.terms,['QX880','PRO','V8']);assert.doesNotMatch(parsed.query,/第\d+页|参数|来源/);
  return page===1?response(rows(0,20),true,23):response(rows(20,3),false,23);
 });
 assert.deepEqual(calls,['物料：QX880 PRO V8 第1页','物料：QX880 PRO V8 第2页']);
 assert.equal(result.assets.length,23);assert.equal(result.has_more,false);
 assert.deepEqual(source(result),{source:'material-library',status:'available',asset_count:23,has_more:false,match_total:23,page_count:2,row_count:23,count_unit:'assets',completeness:'complete',stop_reason:'exhausted'});
});

test('a full final page stops at the first valid total even when the server full-page hint remains true',async()=>{
 let calls=0;
 const result=await lookup(async()=>{calls++;return response(rows(0,20),true,20)});
 assert.equal(calls,1);assert.equal(source(result).stop_reason,'match_total');assert.equal(source(result).completeness,'complete');
});

test('an available empty result is complete rather than a failed source',async()=>{
 const result=await lookup(async()=>response([],false,0));
 assert.equal(result.status,'available');assert.equal(source(result).status,'available');assert.equal(source(result).asset_count,0);
 assert.equal(source(result).page_count,1);assert.equal(result.has_more,false);
});

test('a later empty page cannot erase the first total or conceal a count mismatch',async()=>{
 const result=await lookup(async q=>pageOf(q)===1?response(rows(0,20),true,21):response([],false,null));
 assert.equal(source(result).match_total,21);assert.equal(source(result).row_count,20);assert.equal(source(result).page_count,2);
 assert.equal(source(result).status,'partial');assert.equal(source(result).stop_reason,'count_mismatch');assert.equal(result.has_more,true);
});

test('the first valid total can arrive on a later page and remains fixed thereafter',async()=>{
 const result=await lookup(async q=>pageOf(q)===1?response(rows(0,20),true,NaN):response(rows(20,20),true,40));
 assert.equal(source(result).match_total,40);assert.equal(source(result).row_count,40);assert.equal(source(result).page_count,2);assert.equal(source(result).status,'available');
});

test('a changed total is retained as a partial-coverage warning, with the first total unchanged',async()=>{
 const result=await lookup(async q=>pageOf(q)===1?response(rows(0,20),true,40):response(rows(20,20),false,41));
 assert.equal(source(result).match_total,40);assert.equal(source(result).row_count,40);assert.equal(source(result).status,'partial');
 assert.equal(source(result).stop_reason,'total_changed');assert.equal(result.has_more,true);
});

test('a failed continuation retains successful projections and passes through the existing evidence gate',async()=>{
 const bad=asset('bad');bad.document.pages[0].chunks=['synthetic source'];
 bad.document.product_understanding.findings=[{product:model,field:'配置',value:'synthetic',quote:'unsupported synthetic quote',page:1}];
 const result=await lookup(async q=>{if(pageOf(q)===2)throw new Error('private-looking synthetic error must not escape');return response([bad,...rows(0,19)],true,30)});
 assert.equal(result.status,'available');assert.equal(result.assets.length,20);assert.equal(source(result).status,'partial');
 assert.equal(source(result).page_count,2);assert.equal(source(result).row_count,20);assert.equal(source(result).stop_reason,'lookup_failed');
 assert.doesNotMatch(JSON.stringify(result.source_lookups),/private-looking|quote|question|value/);
 const gated=gateMaterialEvidence(result);assert.equal(gated.assets[0].document.product_understanding.findings.length,0);assert.ok(gated.evidence_gate.rejected>0);
});

test('a first-page failure is unavailable and does not manufacture an empty success',async()=>{
 const result=await lookup(async()=>({status:'not_configured',assets:[]}));
 assert.equal(result.status,'unavailable');assert.equal(source(result).status,'unavailable');assert.equal(source(result).completeness,'unavailable');
 assert.equal(source(result).page_count,1);assert.equal(source(result).row_count,0);
});

test('five pages impose a hard limit of 100 ordinary-library projections and retain a partial marker',async()=>{
 const result=await lookup(async q=>response(rows((pageOf(q)-1)*20,20),true,121));
 assert.equal(result.assets.length,100);assert.equal(source(result).page_count,5);assert.equal(source(result).row_count,100);
 assert.equal(source(result).status,'partial');assert.equal(source(result).stop_reason,'page_limit');assert.equal(result.has_more,true);
});

test('exactly 100 rows can be complete at the same hard limit when the first total is satisfied',async()=>{
 const result=await lookup(async q=>response(rows((pageOf(q)-1)*20,20),true,100));
 assert.equal(result.assets.length,100);assert.equal(source(result).page_count,5);assert.equal(source(result).status,'available');assert.equal(result.has_more,false);
});

test('unknown totals and unknown has_more do not turn a bounded search into a completed search',async()=>{
 const result=await lookup(async q=>response(rows((pageOf(q)-1)*20,20),undefined,null));
 assert.equal(source(result).page_count,5);assert.equal(source(result).match_total,null);assert.equal(source(result).status,'partial');assert.equal(result.has_more,true);
});

test('a repeated page cannot satisfy the total using duplicate rows, but its received rows are still counted',async()=>{
 const first=rows(0,20);
 const result=await lookup(async q=>response(pageOf(q)===1?first:[...first].reverse(),true,40));
 assert.equal(result.assets.length,20);assert.equal(source(result).row_count,40);assert.equal(source(result).page_count,2);
 assert.equal(source(result).status,'partial');assert.equal(source(result).stop_reason,'repeated_page');assert.equal(result.has_more,true);
});

test('overlapping pages preserve unique assets while keeping raw row counts and a partial marker',async()=>{
 const result=await lookup(async q=>pageOf(q)===1?response(rows(0,20),true,40):response([asset(19),...rows(20,19)],false,40));
 assert.equal(result.assets.length,39);assert.equal(source(result).row_count,40);assert.equal(source(result).status,'partial');assert.equal(source(result).stop_reason,'overlapping_page');
});

test('duplicate rows within one ordinary page do not manufacture complete identity coverage',async()=>{
 const same=asset('same');
 const result=await lookup(async()=>response([same,same],false,2));
 assert.equal(result.assets.length,1);assert.equal(source(result).row_count,2);assert.equal(source(result).status,'partial');
 assert.equal(source(result).stop_reason,'duplicate_rows');assert.equal(result.has_more,true);
});

test('ordinary identity deduplication includes the source hash and edition',async()=>{
 const items=[asset('same'),asset('same',{sha:'b'}),asset('same',{version:'V10'})];
 const result=await lookup(async()=>response(items,false,3));
 assert.equal(result.assets.length,3);assert.deepEqual(result.assets.map(a=>[a.document.sha256,a.versionLabel]),items.map(a=>[a.document.sha256,a.versionLabel]));
});

test('V9 continuations retain independent bounded projections and count new PDF pages instead of assets',async()=>{
 const first=asset('v9',{version:'V9',pages:[1,2,3,4,5]}),second=asset('v9',{version:'V9',pages:[6,7,8]}),calls=[];
 const result=await loadMarketMaterials(model+'智能锁V9市场分析',model,null,async q=>{calls.push(q);return response([pageOf(q)===1?first:second],pageOf(q)===1,8)});
 assert.deepEqual(calls,['物料：QX880 PRO 智能锁画册v9 第1页','物料：QX880 PRO 智能锁画册v9 第2页']);
 assert.equal(result.assets.length,2);assert.equal(source(result).row_count,8);assert.equal(source(result).count_unit,'pdf_pages');assert.equal(source(result).status,'available');
 assert.equal(result.assets[0].document,first.document);assert.equal(result.assets[1].document,second.document);
 assert.deepEqual(result.assets.map(a=>a.document.pages.length),[5,3]);
});

test('V9 repeated projections do not double-count PDF pages or discard a genuinely new batch',async()=>{
 const first=asset('v9',{version:'V9',pages:[1,2,3,4,5]});
 const repeated=await loadMarketMaterials(model+'智能锁V9市场分析',model,null,async()=>response([first],true,10));
 assert.equal(repeated.assets.length,1);assert.equal(source(repeated).row_count,5);assert.equal(source(repeated).status,'partial');assert.equal(source(repeated).stop_reason,'repeated_page');
 const overlap=await loadMarketMaterials(model+'智能锁V9市场分析',model,null,async q=>response([pageOf(q)===1?first:asset('v9',{version:'V9',pages:[5,6,7,8]})],pageOf(q)===1,8));
 assert.equal(overlap.assets.length,2);assert.equal(source(overlap).row_count,8);assert.equal(source(overlap).status,'available');
});

test('each source paginates independently and a successful zero-match source does not hide a failed source',async()=>{
 const result=await loadMarketMaterials(model+'智能锁市场分析',model,null,async q=>{
  if(/v9/.test(q))return response([],false,0);
  return pageOf(q)===1?response(rows(0,20),true,21):{status:'unavailable',assets:[]};
 });
 assert.equal(result.status,'available');assert.equal(result.assets.length,20);
 assert.deepEqual(result.source_lookups.map(s=>[s.status,s.page_count,s.asset_count]),[['available',1,0],['partial',2,20]]);
 assert.equal(result.has_more,true);
});

test('an oversized future loader response stays bounded and is never presented as complete',async()=>{
 const result=await lookup(async()=>response(rows(0,25),false,25));
 assert.equal(result.assets.length,20);assert.equal(source(result).row_count,25);assert.equal(source(result).status,'partial');assert.equal(source(result).stop_reason,'response_limit');
});

test('unfinished candidate coverage keeps known fields visible but withholds a market advantage',async()=>{
 const {productMarketReport}=await import('../supabase/functions/agent-conversation/product-market.mjs');
 const a=asset('known');const quote=model+' synthetic fingerprint';
 a.document.pages[0].chunks=[quote];a.document.product_understanding.findings=[{product:model,field:'开锁方式',value:'synthetic fingerprint',quote,page:1}];
 const result=gateMaterialEvidence(await lookup(async q=>{if(pageOf(q)===2)throw Error('synthetic');return response([a,...rows(1,19)],true,23)}));
 const r=productMarketReport({question:ordinary,catalog:{sources:[],products:[],pages:[],facts:[]},materials:result,now:Date.parse('2026-10-26')});
 assert.equal(r.product.facts.length,1);assert.equal(r.product.retrieval_incomplete,true);assert.equal(r.current_parameter_count,0);
 assert.match(r.answer,/物料检索范围尚未完整回读/);assert.match(r.answer,/普通物料库：部分返回/);
 assert.match(r.answer,/返回20项资料投影；已查2批；匹配总数23个文件候选/);assert.match(r.answer,/每份正文仍有解析\/展示限额/);
 assert.doesNotMatch(r.answer,/可作为待测试卖点/);
});
