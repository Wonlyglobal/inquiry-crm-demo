import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {productMarketIntent,productMarketTurn,countryMatches,validMarketEvidence,modelMarketEvidence,countryAssessment,productMarketReport} from '../supabase/functions/agent-conversation/product-market.mjs';
import * as productInput from '../supabase/functions/agent-conversation/product-input.mjs';
const now=Date.parse('2026-10-26T04:00:00Z'),sha='a'.repeat(64);
const catalog={schema:'wonly-catalog-v1',sources:[{id:'c4',pages:12}],products:[{model:'TEST80 PRO',category:'smart_lock',catalog:'c4',page:4,specs:{Unlocking:'Synthetic fingerprint'}}],pages:[{catalog:'c4',page:4,text:'TEST80 PRO synthetic page'}],facts:[]};
const fact={product:'TEST80 PRO',field:'开锁方式',value:'合成指纹、密码',quote:'TEST80 PRO 合成指纹、密码',page:2};
const asset={name:'Synthetic V9.pdf',versionLabel:'V9',isCurrentVersion:true,updatedAt:'2026-10-25',document:{sha256:sha,product_understanding:{findings:[fact]}}};
const materials={status:'available',assets:[asset]};
const report=(q,rest={})=>productMarketReport({question:q,catalog,materials,now,...rest});
test('market questions use a distinct integrated workflow, ordinary parameters do not',()=>{
 for(const q of ['分析TEST80 PRO在新加坡的市场，给出SWOT和匹配度','智能锁各国市场分析','country fit of TEST80 PRO','市场竞争度'])assert.ok(productMarketIntent(q));
 for(const q of ['TEST80 PRO电池参数','今天社媒点赞多少','王力有哪些非洲案例'])assert.equal(productMarketIntent(q),false);
 const src=fs.readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.ok(src.indexOf('if(marketTurn)')<src.indexOf('const v9Turn='));assert.match(src,/nested\|\|guest\|\|marketTurn/);
 assert.match(src,/if\(guest\)return json\(\{answer:'逐款产品市场分析/);
 assert.match(src,/product_country_market_analysis/);
});
test('country detection is exact for ISO/English and supports named countries outside research samples',()=>{
 assert.deepEqual(countryMatches('分析新加坡与英国、墨西哥市场').map(c=>c.code),['GB','MX','SG']);
 assert.deepEqual(countryMatches('help us analyse a lock').map(c=>c.code),[]);
 assert.deepEqual(countryMatches('TEST80 PRO in SG').map(c=>c.code),['SG']);
});
test('query-only market context switches country and model independently without leaking answers',()=>{
 const h=['产品市场：TEST80 PRO智能锁在新加坡SG市场分析V9'];
 const c=productMarketTurn('那英国呢',h);assert.match(c,/TEST80 PRO/);assert.match(c,/V9/);assert.deepEqual(countryMatches(c).map(c=>c.code),['GB']);
 const m=productMarketTurn('换成TEST90 MAX',h);assert.doesNotMatch(m,/TEST80/);assert.match(m,/TEST90 MAX/);assert.match(m,/新加坡/);assert.match(m,/V9/);
 assert.equal(productMarketTurn('今天的SEO点击',h),null);
 assert.equal(productMarketTurn('那今天SEO点击呢',h),null);
 assert.equal(productMarketTurn('那英国呢',['画册检索：TEST80 PRO参数']),null);
 assert.match(productMarketTurn('下一页',['产品市场：智能锁市场分析 产品第2页']),/产品第3页/);
 assert.match(productMarketTurn('下一页',['产品市场：TEST80 PRO所有国家市场分析 国家第2页']),/国家第3页/);
 assert.doesNotMatch(productMarketTurn('那新加坡呢',['产品市场：TEST80 PRO所有国家市场分析']),/所有国家/);
});
test('current model identity, source hash, dates, edition and original page are retained',()=>{
 const p=modelMarketEvidence('TEST80 PRO',catalog,materials,{edition:'V9'});
 assert.equal(p.facts.length,1);assert.equal(p.facts[0].sha256,sha);assert.equal(p.facts[0].date,'2026-10-25');assert.match(p.facts[0].ref,/第2页/);assert.equal(p.supplemental.length,0);
 const wrong={...asset,document:{...asset.document,product_understanding:{findings:[{...fact,product:'TEST90'}]}}};
 assert.equal(modelMarketEvidence('TEST80 PRO',catalog,{status:'available',assets:[wrong]}).facts.length,0);
 assert.equal(modelMarketEvidence('TEST80 PRO',catalog,{status:'available',assets:[{...asset,isCurrentVersion:false}]}).facts.length,0);
 assert.equal(modelMarketEvidence('TEST80 PRO',catalog,materials,{edition:'V8'}).facts.length,0);
 assert.equal(modelMarketEvidence('TEST80 PRO',catalog,materials,{edition:'第九版'}).facts.length,1);
 assert.equal(modelMarketEvidence('TEST80 PRO',catalog,{status:'available',assets:[{...asset,document:{...asset.document,sha256:'bad'}}]}).facts.length,0);
});
test('native excerpt must itself identify the exact model and be present in the source page',()=>{
 const quote='TEST80 PRO synthetic thickness 40mm';
 const doc={sha256:sha,pages:[{page:3,chunks:[quote],facts:[{field:'尺寸',quote}]}]};
 const p=modelMarketEvidence('TEST80 PRO',catalog,{status:'available',assets:[{...asset,document:doc}]});assert.equal(p.facts.length,1);
 const wrong=modelMarketEvidence('TEST80 MAX',catalog,{status:'available',assets:[{...asset,document:doc}]});assert.equal(wrong.facts.length,0);
 const absent=modelMarketEvidence('TEST80 PRO',catalog,{status:'available',assets:[{...asset,document:{...doc,pages:[{...doc.pages[0],chunks:['unrelated']}]}}]});assert.equal(absent.facts.length,0);
});
test('conflicting current fields are excluded rather than arbitrarily selecting a product advantage',()=>{
 const p=modelMarketEvidence('TEST80 PRO',catalog,{status:'available',assets:[asset,{...asset,name:'other',document:{...asset.document,product_understanding:{findings:[{...fact,value:'合成其他开锁'}]}}}]});
 assert.equal(p.facts.length,0);assert.equal(p.conflicts.length,1);
});
test('same country and category official evidence only; competitor existence is not competition score',()=>{
 const p=modelMarketEvidence('TEST80 PRO',catalog,materials);
 const sg=countryMatches('新加坡')[0],a=countryAssessment(p,sg,undefined,now);
 assert.equal(a.cases.length,1);assert.equal(a.admission.length,1);assert.equal(a.score,null);assert.equal(a.competition_score,null);assert.match(a.competition,/强度待核验/);
 const wooden=countryAssessment({...p,category:'wooden_door'},sg,undefined,now);assert.equal(wooden.rows.length,0);
 const mx=countryAssessment(p,countryMatches('墨西哥')[0],undefined,now);assert.equal(mx.rows.length,0);assert.match(mx.competition,/未知/);
});
test('stale official evidence remains visible with dates, but is excluded from present conclusions',()=>{
 const r=report('TEST80 PRO智能锁新加坡SWOT',{now:Date.parse('2027-10-26')});
 assert.equal(r.assessments[0].usable.length,0);assert.match(r.answer,/历史证据，需复核/);assert.match(r.answer,/2026-10-26/);assert.doesNotMatch(r.assessments[0].competition,/存在可核对/);
});
test('SWOT separates unknowns from weaknesses and attributes advice as hypotheses',()=>{
 const r=report('TEST80 PRO智能锁新加坡市场分析，SWOT和国家匹配度');
 for(const re of [/STP/,/SWOT/,/S 潜在优势/,/W 已确认劣势/,/不把未知当实际劣势/,/O 机会假设/,/T 外部威胁/,/五力/,/安装一次通过/,/来源日期/,/SHA-256/,/第2页/,/SCDF/,/未评分/,/未发送外部模型/])assert.match(r.answer,re);
 assert.equal(r.status,'preliminary');assert.equal(r.product.human_verified,false);assert.deepEqual(r.countries,['SG']);
});
test('historical catalogue alone cannot certify a present product or silently replace a requested edition',()=>{
 const r=report('TEST80 PRO智能锁英国SWOT',{materials:{status:'unavailable',assets:[]}});
 assert.equal(r.status,'product_evidence_gap');assert.match(r.answer,/2026年8月版/);assert.match(r.answer,/暂缓/);assert.doesNotMatch(r.answer,/合成指纹、密码/);
 const v=report('TEST80 PRO智能锁V8英国SWOT');assert.equal(v.product.supplemental.length,0);assert.equal(v.product.facts.length,0);
});
test('all countries and all product directories are paginated and never portrayed as completed research',()=>{
 const r=report('TEST80 PRO智能锁所有国家市场分析 国家第2页');assert.equal(r.countries.length,12);assert.match(r.answer,/目录存在不等于已研究/);assert.match(r.answer,/国家第3页/);
 const list=report('智能锁每款产品市场分析');assert.equal(list.status,'needs_model');assert.match(list.answer,/尚未生成或核验该款市场结论/);assert.match(list.answer,/TEST80 PRO/);
});
test('unknown exact model and unavailable private index fail closed rather than using a similar model',()=>{
 const r=report('TEST80 MAX智能锁新加坡市场分析');assert.equal(r.status,'product_evidence_gap');assert.equal(r.product.facts.length,0);assert.equal(r.product.supplemental.length,0);
 const no=report('TEST80 PRO新加坡市场分析',{catalog:null,materials:{status:'unavailable',assets:[]}});assert.match(no.answer,/私有画册索引本次不可用/);assert.match(no.answer,/不改用外部模型/);
});
test('public evidence rejects unverified snippets and unsafe/incomplete source records',()=>{
 const good=validMarketEvidence()[0];assert.equal(validMarketEvidence({schema:'product-market-public-v1',entries:[good,{...good,id:'bad',read_status:'search_snippet'},{...good,id:'url',url:'http://example.com'}]}).length,1);
});
test('actual authenticated market handler resolves its declared imports and returns an audited internal report',async()=>{
 const src=fs.readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 const branch=src.slice(src.indexOf('   if(marketTurn){'),src.indexOf('   const v9Turn='));
 const declared=new Set([...src.matchAll(/import \{([^}]+)\} from '\.\/product-input\.mjs'/g)].flatMap(m=>m[1].split(',').map(s=>s.trim())));
 let lookedUp=false,audited=false;
 const deps={marketTurn:'TEST80 PRO智能锁V9在新加坡市场分析',guest:false,input:{persona:'Grace'},admin:{from:()=>({insert:async x=>{audited=x.after_data.operation==='product_country_market_analysis';return {error:null}}})},loadCatalog:async()=>catalog,findModels:()=>['TEST80 PRO'],loadFullMaterials:async()=>{lookedUp=true;return materials},gateMaterialEvidence:x=>x,materialConfig:{},productMarketReport,user:{id:'synthetic'},action:'synthetic',key:'synthetic',ticket:async()=>null,json:x=>x};
 for(const name of declared)if(name in productInput)deps[name]=productInput[name];
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const result=await new AsyncFunction(...Object.keys(deps),branch)(...Object.values(deps));
 assert.equal(result.provider,'internal');assert.equal(result.context.route,'product_market');assert.equal(result.context.status,'preliminary');assert.equal(lookedUp,true);assert.equal(audited,true);assert.match(result.answer,/SWOT/);
});
