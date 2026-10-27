import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeProductTurn,loadPrivateProductEvidence,nativeProductAnswer,nativeProductKey,nativeLookupText} from '../supabase/functions/agent-conversation/private-product-knowledge.mjs';
import {privateIntelligenceAnswer,privateIntelligenceQuery} from '../supabase/functions/agent-conversation/private-intelligence.mjs';
import {validPrivateReceipt,privateReceiptLabel} from '../assets/agent-private-intelligence.mjs';
import {productDocument,region,rekey,productKey} from './private-product-evidence-fixture.mjs';
import {productMarketReport} from '../supabase/functions/agent-conversation/product-market.mjs';
import {PRIVATE_REPORT_KEY,privateReportQuestion} from '../assets/agent-private-report-context.mjs';
const id='11111111-1111-4111-8111-111111111111',digest='b'.repeat(64);
const row=()=>({id,digest,imported_at:'2026-10-26T01:00:00Z',document:productDocument()});
const syntheticRow=({model='TEST80 PRO',sha='a'.repeat(64),edition='V9',page=1}={})=>{
 const r=row(),d=r.document;d.source_sha256=sha;d.product_evidence.model=model;d.product_evidence.source_sha256=sha;d.product_evidence.source_edition=edition;
 d.product_evidence.regions=[{...region({model,page}),source_sha256:sha}];rekey(d);return r;
};
const sourceFor=(r,extra={})=>({id:'synthetic-'+r.document.source_sha256,name:'Synthetic catalogue',versionLabel:r.document.product_evidence.source_edition,isCurrentVersion:true,document:{sha256:r.document.source_sha256,pages:r.document.product_evidence.regions.map(r=>({page:r.page,chunks:[],facts:[]}))},...extra});
const syntheticStore=rows=>{const calls=[];return {calls,client:{rpc:async(name,args)=>{calls.push([name,args]);return {data:{documents:(args.p_key?rows.filter(r=>r.document.key===args.p_key):rows).slice(0,args.p_limit)}}}}}};
test('native parameter followups retain full model and explicit edition but not an unrelated request',()=>{
 const turn=nativeProductTurn('介绍TEST80 Pro V9的参数');assert.equal(turn.model,'TEST80 PRO');
 const next=nativeProductTurn('那它的电池呢',['私有产品：'+turn.question]);assert.equal(next.model,'TEST80 PRO');assert.equal(next.edition.toLowerCase(),'v9');
 assert.equal(nativeProductTurn('那天气怎么样',['私有产品：'+turn.question]),null);
 const switched=nativeProductTurn('换成TEST81 Pro',['私有产品：'+turn.question]);assert.equal(switched.model,'TEST81 PRO');assert.equal(switched.edition,'V9');
 assert.equal(nativeProductTurn('比较TEST80和TEST80 Pro的参数'),null);
});
test('private product reads use bounded owner RPC and same source rather than packet authority',async()=>{
 const calls=[],client={rpc:async(name,args)=>{calls.push([name,args]);return {data:{documents:[row()]}}}};
 const result=await loadPrivateProductEvidence(client,{model:'TEST80 Pro',edition:'V9',materials:{assets:[{id:'asset',versionLabel:'V9',isCurrentVersion:true,document:{sha256:'a'.repeat(64),pages:[{page:1}]}}]}});
 assert.equal(calls[0][0],'read_agent_private_intelligence');assert.equal(calls[0][1].p_kind,'product');assert.equal(calls[0][1].p_limit,1);assert.equal(calls[0][1].p_key,row().document.key);
 assert.equal(result.receipts[0].id,id);assert.equal(result.facts.length,1);assert.equal(result.facts[0].analysis_eligible,true);
 const missing=await loadPrivateProductEvidence(client,{model:'TEST80 Basic',materials:{assets:[]}});assert.equal(missing.status,'not_found');
 const chineseEdition=await loadPrivateProductEvidence(client,{model:'TEST80 Pro',edition:'第九版',materials:{assets:[]}});assert.equal(chineseEdition.receipts.length,1);
 const unmatched=await loadPrivateProductEvidence(client,{model:'TEST80 Pro',materials:{assets:[]}});assert.equal(unmatched.facts[0].analysis_eligible,false);
 const failed=await loadPrivateProductEvidence({rpc:async()=>({error:{message:'not exposed'}})},{model:'TEST80 Pro'});assert.equal(failed.status,'unavailable');assert.equal(failed.facts.length,0);
});
test('a rejected second private configuration withholds analysis of all native candidates',async()=>{
 const good=row(),bad=structuredClone(good);bad.id='22222222-2222-4222-8222-222222222222';
 bad.document.source_sha256='c'.repeat(64);bad.document.product_evidence.source_sha256='c'.repeat(64);bad.document.product_evidence.regions[0].source_sha256='c'.repeat(64);rekey(bad.document);
 const r=bad.document.product_evidence.regions[0];r.field.bbox=[300,10,450,30];
 const client={rpc:async(name,args)=>({data:{documents:[good,bad].filter(r=>r.document.key===args.p_key)}})},materials={status:'available',assets:[good,bad].map(r=>({id:r.id,versionLabel:'V9',isCurrentVersion:true,document:{sha256:r.document.source_sha256,pages:[{page:1}]}}))};
 const result=await loadPrivateProductEvidence(client,{model:'TEST80 PRO',edition:'V9',materials});assert.equal(result.facts.length,1);assert.equal(result.blocked.length,1);assert.equal(result.facts[0].analysis_eligible,false);
});
test('saved product receipt/list reads remain compatible without claiming source verification',()=>{
 const r=row(),receipt={id,digest,key:r.document.key};assert.equal(validPrivateReceipt(receipt),true);assert.match(privateReceiptLabel(receipt.key),/产品原生页/);
 assert.equal(validPrivateReceipt({...receipt,key:'product-'+('a'.repeat(63))}),false);
 assert.equal(PRIVATE_REPORT_KEY.test(receipt.key),true);assert.equal(privateReportQuestion('来源有哪些',receipt.key),'查看私有知识 '+receipt.key+'，来源有哪些');assert.equal(privateReportQuestion('换成TEST81 Pro',receipt.key),'换成TEST81 Pro');
 const query=privateIntelligenceQuery('查看私有知识 '+receipt.key);assert.equal(query.p_key,receipt.key);assert.equal(query.p_kind,'product');
 const answer=privateIntelligenceAnswer({documents:[r]},'查看私有知识 '+receipt.key);assert.match(answer,/Synthetic supply 8V/);assert.match(answer,/未完成同源现行验证/);assert.match(answer,/知识包SHA-256/);assert.match(answer,/原文发布日期：未知/);
 assert.ok(answer.includes(r.document.product_evidence.gaps[0]));
});
test('parameter response uses original quotes, no commercial score and a query-only context',()=>{
 const turn={model:'TEST80 Pro',edition:'V9',question:'TEST80 Pro V9参数'};
 const answer=nativeProductAnswer({facts:[],receipts:[],gaps:[],status:'not_found'},turn);
 assert.match(answer.answer,/不借用相邻型号/);assert.match(answer.answer,/不据此给出国家商业匹配评分/);assert.equal(answer.material_question,'私有产品：'+turn.question);
 assert.match(nativeProductAnswer({facts:[],gaps:[]},{...turn,question:'TEST80 Pro 的防水等级是多少'}).answer,/具体参数未在这些原生文字中/);
});
test('compound parameter questions name each missing dimension without borrowing a known value',()=>{
 const result={facts:[{field:'门厚',value:'Door thickness 40-80mm',ref:'Synthetic page 1',edition:'V9',sha256:'a'.repeat(64),analysis_eligible:true}],receipts:[],gaps:[]};
 const answer=nativeProductAnswer(result,{model:'TEST80 PRO',edition:'V9',question:'TEST80 PRO；门厚、防水等级和最大承重是多少？'}).answer;
 assert.match(answer,/门厚：下方同型号原文含相关线索/);assert.match(answer,/防水与防护等级：本次摘录未返回可定位的原文参数，保持未知/);assert.match(answer,/最大承重：本次摘录未返回可定位的原文参数，保持未知/);assert.match(answer,/Door thickness 40-80mm/);
 const follow=nativeProductTurn('它的原文发布日期呢',['私有产品：TEST80 PRO V9；参数']);assert.equal(follow.model,'TEST80 PRO');assert.equal(follow.edition,'V9');
});
test('only source-validated private facts supplement a market report and never establish commercial admission',async()=>{
 const client={rpc:async()=>({data:{documents:[row()]}})},materials={status:'available',assets:[{id:'source',name:'Synthetic source',versionLabel:'V9',isCurrentVersion:true,document:{sha256:'a'.repeat(64),pages:[{page:1,chunks:[],facts:[]}]}}],source_lookups:[{completeness:'complete'}]};
 const native=await loadPrivateProductEvidence(client,{model:'TEST80 PRO',edition:'V9',materials});
 const catalog={sources:[],products:[{model:'TEST80 PRO',category:'smart_lock'}]};
 const report=productMarketReport({question:'TEST80 PRO智能锁V9在肯尼亚的市场分析',catalog,materials,native,evidence:[],now:Date.parse('2026-10-26')});
 assert.equal(report.current_parameter_count,1);assert.match(report.answer,/Synthetic supply 8V/);assert.match(report.answer,/试销和国家评级均暂缓/);
 assert.equal(report.assessments[0].score,null);
 const unmatched=await loadPrivateProductEvidence(client,{model:'TEST80 PRO',edition:'V9',materials:{assets:[]}});
 const blocked=productMarketReport({question:'TEST80 PRO智能锁V9在肯尼亚的市场分析',catalog,materials,native:unmatched,evidence:[]});assert.equal(blocked.current_parameter_count,0);
});

test('full-model source keys retain suffixes and use the source SHA rather than the packet digest',async()=>{
 const sha='a'.repeat(64),expected=productKey(sha,'TEST80 PRO');
 for(const model of ['TEST80 PRO','test80-pro','ＴＥＳＴ８０ ＰＲＯ','TEST80/PRO','TEST80.PRO','TEST80\nPRO'])assert.equal(await nativeProductKey(sha,model),expected);
 assert.notEqual(await nativeProductKey(sha,'TEST80'),expected);assert.notEqual(await nativeProductKey(digest,'TEST80 PRO'),expected);
 for(const model of ['V9','ISO9001','TEST80 PRO！','',null])await assert.rejects(nativeProductKey(sha,model));
});

test('source-key reads recover an older SKU beyond the latest-five window and never append a fallback',async()=>{
 const target=syntheticRow(),others=Array.from({length:6},(_,i)=>syntheticRow({model:'TEST'+(90+i)+' PRO'}));
 const {client,calls}=syntheticStore([...others,target]);
 const result=await loadPrivateProductEvidence(client,{model:'TEST80 PRO',edition:'V9',materials:{assets:[sourceFor(target)]}});
 assert.equal(result.lookup_mode,'source_keys');assert.equal(result.status,'available');assert.equal(result.facts.length,1);assert.equal(result.facts[0].analysis_eligible,true);
 assert.equal(result.read_count,1);assert.equal(calls.length,1);assert.equal(calls[0][1].p_key,target.document.key);assert.equal(calls[0][1].p_limit,1);
 assert.match(nativeLookupText(result),/已查1\/1个去重知识键/);assert.match(nativeLookupText(result),/未追加最近记录回退/);
 const empty=syntheticStore([]),miss=await loadPrivateProductEvidence(empty.client,{model:'TEST80 PRO',materials:{assets:[sourceFor(target)]}});
 assert.equal(miss.status,'not_found');assert.equal(miss.read_count,0);assert.ok(miss.gaps.includes('private_product_key_not_found'));assert.equal(empty.calls.length,1);assert.ok(empty.calls.every(([,a])=>a.p_key!==null));
 const multi=syntheticStore([]),missed=await loadPrivateProductEvidence(multi.client,{model:'TEST80 PRO',materials:{assets:['a','c','d'].map(x=>sourceFor(syntheticRow({sha:x.repeat(64)})))}});
 assert.equal(missed.status,'not_found');assert.equal(missed.attempted_keys,3);assert.equal(missed.read_count,0);assert.equal(multi.calls.length,3);assert.ok(multi.calls.every(([,a])=>a.p_key!==null&&a.p_limit===1));
});

test('same source projections and V9 aliases deduplicate keys while retaining their authorized pages',async()=>{
 const target=syntheticRow({page:2}),store=syntheticStore([target]);
 const result=await loadPrivateProductEvidence(store.client,{model:'TEST80 PRO',edition:'第九版',materials:{assets:[sourceFor(target,{id:'page-one',document:{sha256:target.document.source_sha256,pages:[{page:1}]}}),sourceFor(target,{id:'page-two',versionLabel:'第九版'})]}});
 assert.equal(store.calls.length,1);assert.equal(result.source_key_count,1);assert.equal(result.source_metadata_conflict,false);assert.equal(result.facts[0].analysis_eligible,true);assert.equal(result.facts[0].source_page,2);
});

test('at most five exact keys are read serially and an unexamined sixth source disables every candidate',async()=>{
 const rows=Array.from({length:6},(_,i)=>syntheticRow({sha:(i+1).toString(16).repeat(64)})),calls=[];let active=0,maxActive=0;
 const client={rpc:async(name,args)=>{active++;maxActive=Math.max(maxActive,active);calls.push(args);await Promise.resolve();active--;return {data:{documents:rows.filter(r=>r.document.key===args.p_key)}}}};
 const result=await loadPrivateProductEvidence(client,{model:'TEST80 PRO',materials:{assets:rows.map(r=>sourceFor(r))}});
 assert.equal(calls.length,5);assert.equal(maxActive,1);assert.ok(calls.every(a=>a.p_limit===1&&a.p_key!==null));assert.equal(new Set(calls.map(a=>a.p_key)).size,5);
 assert.equal(result.source_key_count,6);assert.equal(result.attempted_keys,5);assert.equal(result.read_count,5);assert.equal(result.has_unexamined,true);assert.equal(result.retrieval_incomplete,true);assert.equal(result.status,'partial');assert.equal(result.facts.length,5);assert.ok(result.facts.every(f=>f.analysis_eligible===false));
 assert.ok(result.gaps.includes('private_product_source_limit'));assert.match(nativeLookupText(result),/已查5\/6/);
});

test('one exact read failure stops without retry or latest fallback and withholds legacy market strengths too',async()=>{
 const rows=['a','c','d'].map(x=>syntheticRow({sha:x.repeat(64)})),calls=[];
 const client={rpc:async(name,args)=>{calls.push(args);return calls.length===2?{error:{message:'SYNTHETIC-PRIVATE-ERROR'}}:{data:{documents:rows.filter(r=>r.document.key===args.p_key)}}}};
 const materials={status:'available',source_lookups:[{completeness:'complete'}],assets:rows.map(r=>sourceFor(r))};
 const quote='TEST80 PRO synthetic keypad';materials.assets[0].document.pages[0].chunks=[quote];materials.assets[0].document.product_understanding={findings:[{product:'TEST80 PRO',field:'开锁方式',value:'synthetic keypad',quote,page:1}]};
 const native=await loadPrivateProductEvidence(client,{model:'TEST80 PRO',edition:'V9',materials});
 assert.equal(calls.length,2);assert.ok(calls.every(a=>a.p_key!==null));assert.equal(native.read_count,1);assert.equal(native.status,'partial');assert.equal(native.retrieval_incomplete,true);assert.equal(native.facts.length,1);assert.equal(native.facts[0].analysis_eligible,false);assert.doesNotMatch(JSON.stringify(native),/SYNTHETIC-PRIVATE-ERROR/);
 const report=productMarketReport({question:'TEST80 PRO智能锁V9在肯尼亚市场分析',catalog:{sources:[],products:[{model:'TEST80 PRO',category:'smart_lock'}]},materials,native,evidence:[]});
 assert.equal(report.current_parameter_count,0);assert.equal(report.product.retrieval_incomplete,true);assert.doesNotMatch(report.answer,/可作为待测试卖点/);assert.match(nativeProductAnswer(native,{model:'TEST80 PRO',edition:'V9',question:'参数'}).answer,/读取失败不表示没有参数/);
});

test('malformed, oversized and out-of-scope exact responses fail closed within the original raw-row budget',async t=>{
 const target=syntheticRow(),materials={assets:[sourceFor(target)]};
 for(const [name,change] of Object.entries({wrong_key:r=>{r.document.key='product-'+('f'.repeat(64))},wrong_model:r=>{r.document.product_evidence.model='TEST80 BASIC'},wrong_sha:r=>{r.document.source_sha256='c'.repeat(64)},wrong_inner_sha:r=>{r.document.product_evidence.source_sha256='c'.repeat(64)},wrong_edition:r=>{r.document.product_evidence.source_edition='V8'},wrong_digest:r=>{r.digest='invalid'}}))await t.test(name,async()=>{
  const bad=structuredClone(target);change(bad);let calls=0;
  const result=await loadPrivateProductEvidence({rpc:async()=>{calls++;return {data:{documents:[bad]}}}},{model:'TEST80 PRO',materials});
  assert.equal(calls,1);assert.equal(result.status,'unavailable');assert.equal(result.retrieval_incomplete,true);assert.equal(result.receipts.length,0);assert.equal(result.facts.length,0);assert.equal(result.read_count,1);
 });
 for(const documents of [null,{},[target,target]])await t.test(Array.isArray(documents)?'oversized':'malformed '+String(documents),async()=>{
  let calls=0;const result=await loadPrivateProductEvidence({rpc:async()=>{calls++;return {data:{documents}}}},{model:'TEST80 PRO',materials});
  assert.equal(calls,1);assert.equal(result.status,'unavailable');assert.equal(result.retrieval_incomplete,true);assert.equal(result.receipts.length,0);assert.equal(result.facts.length,0);assert.ok(result.read_count<=5);
 });
 let calls=0;const invalid=await loadPrivateProductEvidence({rpc:async()=>{calls++;return {data:{documents:[]}}}},{model:'V9',materials});assert.equal(calls,0);assert.equal(invalid.status,'unavailable');assert.ok(invalid.gaps.includes('private_product_scope_invalid'));
});

test('only a missing effective current source chooses one latest-five candidate path and counts rows before filtering',async t=>{
 const target=syntheticRow();
 for(const [name,source,edition] of [
  ['absent',null,''],['historical',sourceFor(target,{isCurrentVersion:false}),''],['unknown-current',sourceFor(target,{isCurrentVersion:undefined}),''],['truthy-current',sourceFor(target,{isCurrentVersion:'true'}),''],['unknown-edition',sourceFor(target,{versionLabel:'Unspecified'}),''],['filename-only-edition',sourceFor(target,{versionLabel:'',name:'Synthetic V9'}),''],['non-edition-label',sourceFor(target,{versionLabel:'Synthetic V9'}),''],['invalid-SHA',sourceFor(target,{document:{sha256:'invalid',pages:[{page:1}]}}),''],['different-edition',sourceFor(target),'V8']
 ])await t.test(name,async()=>{
  const other=syntheticRow({model:'TEST81 PRO'}),store=syntheticStore([other,target]);
  const result=await loadPrivateProductEvidence(store.client,{model:'TEST80 PRO',edition,materials:{assets:source?[source]:[]}});
  assert.equal(store.calls.length,1);assert.equal(store.calls[0][1].p_key,null);assert.equal(store.calls[0][1].p_limit,5);assert.equal(result.lookup_mode,'latest_candidates');assert.equal(result.read_count,2);assert.ok(result.facts.every(f=>f.analysis_eligible===false));assert.ok(result.gaps.includes('private_product_no_current_source'));assert.match(nativeLookupText(result),/所有候选均不参与正向分析/);
 });
 const rows=[...Array.from({length:4},(_,i)=>syntheticRow({model:'TEST'+(90+i)+' PRO'})),target],store=syntheticStore(rows),result=await loadPrivateProductEvidence(store.client,{model:'TEST80 PRO',materials:{assets:[]}});
 assert.equal(result.read_count,5);assert.equal(result.facts.length,1);assert.equal(result.status,'partial');assert.equal(result.has_unexamined,true);assert.equal(result.retrieval_incomplete,true);assert.equal(result.facts[0].analysis_eligible,false);assert.ok(result.gaps.includes('private_product_candidate_limit'));assert.equal(store.calls.length,1);
});

test('same-SHA edition conflicts survive explicit-edition filtering and aliases do not create conflicts',async()=>{
 const target=syntheticRow();
 for(const assets of [[sourceFor(target),sourceFor(target,{versionLabel:'V8'})],[sourceFor(target,{name:'Synthetic V8',versionLabel:'V9'})]]){
  const store=syntheticStore([target]),result=await loadPrivateProductEvidence(store.client,{model:'TEST80 PRO',edition:'V9',materials:{assets}});
  assert.equal(store.calls.length,1);assert.equal(result.source_key_count,1);assert.equal(result.source_metadata_conflict,true);assert.equal(result.retrieval_incomplete,true);assert.equal(result.facts[0].analysis_eligible,false);assert.ok(result.gaps.includes('private_product_source_edition_conflict'));
 }
 const store=syntheticStore([target]),alias=await loadPrivateProductEvidence(store.client,{model:'TEST80 PRO',edition:'V9',materials:{assets:[sourceFor(target,{name:'Synthetic 第九版',versionLabel:'V9'})]}});
 assert.equal(alias.source_metadata_conflict,false);assert.equal(alias.facts[0].analysis_eligible,true);
});

test('the actual native handler returns an incomplete read without a false missing-parameter or voice success claim',async()=>{
 const {readFile}=await import('node:fs/promises'),src=await readFile(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 const branch=src.slice(src.indexOf('   const nativeTurn=guest?'),src.indexOf('   const v9Turn='));
 let audited=false,spoken='';const target=syntheticRow();
 const deps={guest:false,nativeProductTurn,loadPrivateProductEvidence,nativeProductAnswer,input:{question:'TEST80 PRO V9的供电参数',persona:'Grace',materialHistory:[]},client:{rpc:async()=>({error:{message:'SYNTHETIC-PRIVATE-ERROR'}})},admin:{from:()=>({insert:async x=>{audited=x.after_data.operation==='private_product_native';return {error:null}}})},loadCatalog:async()=>({sources:[],products:[]}),gateMaterialEvidence:x=>x,loadMarketMaterials:async()=>({status:'available',assets:[sourceFor(target)]}),loadFullMaterials:()=>{throw Error('Unexpected extra read')},materialConfig:{},user:{id:'synthetic'},action:'synthetic',key:'synthetic',ticket:async x=>{spoken=x.text;return null},json:x=>x};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,result=await new AsyncFunction(...Object.keys(deps),branch+'\nreturn {fallthrough:true};')(...Object.values(deps));
 assert.equal(audited,true);assert.equal(result.fallthrough,undefined);assert.equal(result.provider,'internal');assert.equal(result.model,'private-product-native');assert.equal(result.context.native_fields,0);assert.match(result.answer,/补读未完成/);assert.doesNotMatch(result.answer,/SYNTHETIC-PRIVATE-ERROR/);assert.match(spoken,/不能据此判断没有参数/);assert.doesNotMatch(spoken,/原生文字证据已放在窗口里/);
});
