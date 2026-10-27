import {loadPrivateProductEvidence,nativeGapText,nativeLookupText} from '../supabase/functions/agent-conversation/private-product-knowledge.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {marketProductScope,marketMaterialQuestions,loadMarketMaterials,productMarketReport} from '../supabase/functions/agent-conversation/product-market.mjs';
import {materialQuery} from '../supabase/functions/agent-conversation/document-knowledge.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
import * as productInput from '../supabase/functions/agent-conversation/product-input.mjs';
import {crmMarketPriorityIntent,crmMarketPriorityScope,withCrmMarketPriority} from '../supabase/functions/agent-conversation/market-priority.mjs';

const model='TEST80 PRO',question=model+'智能锁越南市场分析';
const catalog={schema:'wonly-catalog-v1',sources:[{id:'synthetic',pages:1}],products:[{model,category:'smart_lock',catalog:'synthetic',page:1}],pages:[],facts:[]};
const asset=(version,hash,field='配置')=>{
 const quote=model+' synthetic '+field;
 return {id:'same-synthetic-id',name:'Synthetic '+version,versionLabel:version,isCurrentVersion:true,updatedAt:version==='V9'?'2026-10-24':'2026-10-25',document:{status:'ready',sha256:hash.repeat(64),pages_total:1,pages:[{page:1,chunks:[quote],facts:[]}],product_understanding:{status:'ready',findings:[{product:model,field,value:'synthetic '+field,quote,page:1}]}}};
};
const response=(assets,extra={})=>({status:'available',assets,has_more:false,...extra});

test('unversioned smart-lock market scope queries V9 and ordinary library by the complete model only',()=>{
 assert.equal(marketProductScope(question,catalog),question);
 const plan=marketMaterialQuestions(question,model,catalog);
 assert.deepEqual(plan,[{source:'smart-lock-v9',question:'物料：TEST80 PRO 智能锁画册v9'},{source:'material-library',question:'物料：TEST80 PRO'}]);
 for(const item of plan)assert.doesNotMatch(item.question,/参数|来源|页码|越南|市场/);
 assert.deepEqual(materialQuery(plan[1].question).terms,['TEST80','PRO']);
 assert.equal(materialQuery(plan[1].question).constraints.version,'');
 assert.match(materialQuery(plan[0].question).query,/智能锁画册v9.*TEST80 PRO/);
});

test('explicit editions never add another source or fall back to another version',()=>{
 for(const version of ['V9','第九版']){
  const plan=marketMaterialQuestions(question+' '+version,model,catalog);
  assert.equal(plan.length,1);assert.equal(plan[0].source,'smart-lock-v9');assert.match(plan[0].question,/智能锁画册v9/);
 }
 for(const version of ['V8','V90']){
  const plan=marketMaterialQuestions(question+' '+version,model,catalog);
  assert.deepEqual(plan,[{source:'material-library',question:'物料：TEST80 PRO '+version}]);
 }
});

test('an unavailable explicit V9 request does not issue an ordinary-library fallback',async()=>{
 const calls=[];
 const result=await loadMarketMaterials(question+' V9',model,catalog,async q=>{calls.push(q);throw new Error('synthetic unavailable')});
 assert.deepEqual(calls,['物料：TEST80 PRO 智能锁画册v9 第1页']);assert.equal(result.status,'unavailable');assert.equal(result.assets.length,0);
 assert.deepEqual(result.source_lookups.map(s=>s.source),['smart-lock-v9']);
});

test('category routing does not assume that every known or unknown model is a smart lock',()=>{
 assert.equal(marketMaterialQuestions(model+'越南市场分析',model,catalog).length,2);
 assert.equal(marketMaterialQuestions(question,model,null).length,2);
 assert.deepEqual(marketMaterialQuestions(model+'木门越南市场分析',model,null),[{source:'material-library',question:'物料：TEST80 PRO'}]);
 assert.equal(marketMaterialQuestions(model+'越南市场分析',model,null).length,1);
});

test('same asset identifiers across lookups retain independent source, edition, hash and date',async()=>{
 const v9=asset('V9','a'),library=asset('V10','b'),calls=[];
 const result=await loadMarketMaterials(question,model,catalog,async q=>{calls.push(q);return response([/v9/.test(q)?v9:library],{has_more:false,match_total:1})});
 assert.equal(calls.length,2);assert.equal(result.status,'available');assert.equal(result.assets.length,2);
 assert.deepEqual(result.assets.map(a=>[a.market_source,a.versionLabel,a.document.sha256,a.updatedAt]),[
  ['smart-lock-v9','V9','a'.repeat(64),'2026-10-24'],['material-library','V10','b'.repeat(64),'2026-10-25']]);
 assert.equal('market_source' in v9,false);assert.equal('market_source' in library,false);
 assert.deepEqual(result.source_lookups.map(s=>s.asset_count),[1,1]);
});

test('lookup limits and unknown coverage remain distinct instead of claiming a completed whole-library search',async()=>{
 const result=await loadMarketMaterials(question,model,catalog,async q=>response([],/v9/.test(q)?{has_more:true,match_total:8}:{has_more:undefined}));
 assert.equal(result.has_more,true);
 assert.deepEqual(result.source_lookups.map(({source,status,asset_count,has_more,match_total})=>({source,status,asset_count,has_more,match_total})),[
  {source:'smart-lock-v9',status:'partial',asset_count:0,has_more:true,match_total:8},
  {source:'material-library',status:'partial',asset_count:0,has_more:true,match_total:null}]);
});

test('one failed lookup preserves the other source and returns only fixed status diagnostics',async()=>{
 const result=await loadMarketMaterials(question,model,catalog,async q=>{
  if(/v9/.test(q))throw new Error('synthetic error must not be returned');
  return response([asset('V10','b')],{has_more:false});
 });
 assert.equal(result.status,'available');assert.equal(result.assets.length,1);assert.equal(result.assets[0].versionLabel,'V10');
 assert.deepEqual(result.source_lookups.map(s=>s.status),['unavailable','available']);
 assert.doesNotMatch(JSON.stringify(result.source_lookups),/synthetic error|question|query|value|quote/);
 const failed=await loadMarketMaterials(question,model,catalog,async()=>({status:'unexpected status with synthetic text',assets:[asset('V9','a')]}));
 assert.equal(failed.status,'unavailable');assert.equal(failed.assets.length,0);
 const unconfigured=await loadMarketMaterials(question,model,catalog,async()=>({status:'not_configured',assets:[]}));
 assert.equal(unconfigured.status,'unavailable');
});

test('the existing evidence gate still rejects unsupported quotes from either source',async()=>{
 const invalid=asset('V10','b');invalid.document.product_understanding.findings[0].quote='unreturned synthetic quote';
 const data=gateMaterialEvidence(await loadMarketMaterials(question,model,catalog,async q=>response([/v9/.test(q)?asset('V9','a'):invalid])));
 assert.equal(data.assets[0].document.product_understanding.findings.length,1);
 assert.equal(data.assets[1].document.product_understanding.findings.length,0);
 assert.equal(data.evidence_gate.diagnostics.semantic_quote_missing,1);
 assert.equal(data.source_lookups.length,2);
});

test('actual market handler makes two authorized lookups and exposes source statuses for an unversioned request',async()=>{
 const src=fs.readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.match(src,/import \{[^\n]*loadMarketMaterials[^\n]*\} from '\.\/product-market\.mjs'/);
 const branch=src.slice(src.indexOf('   if(marketTurn){'),src.indexOf('   const v9Turn=')),calls=[];
 let audited=false;
 const deps={client:{rpc:async()=>({data:{documents:[]}})},loadPrivateProductEvidence,nativeGapText,nativeLookupText,marketTurn:question,guest:false,input:{persona:'Grace'},admin:{from:()=>({insert:async x=>{audited=x.after_data.operation==='product_country_market_analysis';return {error:null}}})},loadCatalog:async()=>catalog,findModels:()=>[model],loadFullMaterials:async config=>{calls.push(config.question);return response([/v9/.test(config.question)?asset('V9','a','配置'):asset('V10','b','安装')])},gateMaterialEvidence,materialConfig:{},productMarketReport,marketProductScope,loadMarketMaterials,crmMarketPriorityIntent,crmMarketPriorityScope,withCrmMarketPriority,evidenceCheck:()=>({status:'synthetic'}),user:{id:'synthetic'},action:'synthetic',key:'synthetic',ticket:async()=>null,json:x=>x};
 for(const name of [...src.matchAll(/import \{([^}]+)\} from '\.\/product-input\.mjs'/g)].flatMap(m=>m[1].split(',').map(s=>s.trim())))if(name in productInput)deps[name]=productInput[name];
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const result=await new AsyncFunction(...Object.keys(deps),branch)(...Object.values(deps));
 assert.equal(calls.length,2);assert.deepEqual(calls,['物料：TEST80 PRO 智能锁画册v9 第1页','物料：TEST80 PRO 第1页']);
 assert.equal(audited,true);assert.equal(result.provider,'internal');assert.equal(result.context.material_sources.length,2);
 assert.match(result.context.material_question,/产品市场：/);assert.doesNotMatch(result.context.material_question,/v9/i);
 assert.match(result.answer,/指定资料版本：未指定/);assert.match(result.answer,/SHA-256 a{64}/);assert.match(result.answer,/SHA-256 b{64}/);
 assert.doesNotMatch(result.ticket||'',/synthetic/);
});

test('disjoint fields from independent source hashes remain visible but never form a merged configuration',async()=>{
 const result=gateMaterialEvidence(await loadMarketMaterials(question,model,catalog,async q=>response([/v9/.test(q)?asset('V9','a','配置'):asset('V10','b','安装')])));
 const r=productMarketReport({question,catalog,materials:result,now:Date.parse('2026-10-26')});
 assert.equal(r.product.facts.length,2);assert.equal(r.product.source_configuration_count,2);
 assert.equal(r.product.source_configuration_ambiguous,true);assert.equal(r.current_parameter_count,0);
 assert.equal(r.status,'product_evidence_gap');assert.equal(r.assessments[0].decision.stage,'product_evidence_gap');
 assert.match(r.answer,/多份独立来源的配置尚未对齐/);assert.match(r.answer,/不拼接为同一产品配置/);
 assert.match(r.answer,/V9私有快照：已返回/);assert.match(r.answer,/普通物料库：已返回/);
 assert.doesNotMatch(r.answer,/可作为待测试卖点/);
});

test('repeated references to one source hash do not manufacture a second configuration',async()=>{
 const result=gateMaterialEvidence(await loadMarketMaterials(question,model,catalog,async q=>response([/v9/.test(q)?asset('V9','a','配置'):asset('V9','a','安装')])));
 const r=productMarketReport({question,catalog,materials:result,now:Date.parse('2026-10-26')});
 assert.equal(r.product.source_configuration_count,1);assert.equal(r.product.source_configuration_ambiguous,false);
 assert.equal(r.current_parameter_count,2);assert.equal(r.status,'preliminary');
});

test('edition metadata conflicts on the same SHA cannot manufacture a shared market configuration',()=>{
 const first=asset('V9','a','配置'),second=asset('V8','a','安装');
 for(const q of [question,question+' V9']){
  const r=productMarketReport({question:q,catalog,materials:response([first,second]),evidence:[]});
  assert.equal(r.product.source_metadata_conflict,true);assert.equal(r.product.source_configuration_ambiguous,true);assert.equal(r.current_parameter_count,0);assert.match(r.answer,/同一来源SHA对应多个版次标签/);assert.doesNotMatch(r.answer,/可作为待测试卖点/);
 }
 const aliases=productMarketReport({question:question+' 第九版',catalog,materials:response([first,{...first,name:'Synthetic 第九版',versionLabel:'第九版'}]),evidence:[]});
 assert.equal(aliases.product.source_metadata_conflict,false);assert.equal(aliases.current_parameter_count,1);
});

test('an explicit edition cannot be selected by a filename that disagrees with its version label',()=>{
 const source={...asset('V9','a'),name:'Synthetic V8'};
 const r=productMarketReport({question:question+' V8',catalog,materials:response([source]),evidence:[]});
 assert.equal(r.product.facts.length,0);assert.equal(r.product.source_metadata_conflict,true);assert.equal(r.current_parameter_count,0);assert.doesNotMatch(r.answer,/可作为待测试卖点/);
 const unversioned=productMarketReport({question,catalog,materials:response([source]),evidence:[]});
 assert.equal(unversioned.product.facts.length,1);assert.equal(unversioned.current_parameter_count,0);assert.equal(unversioned.product.source_metadata_conflict,true);
});
