import test from 'node:test';
import assert from 'node:assert/strict';
import {projectQuestion,projectIntent,projectEvidence,projectTurn} from '../supabase/functions/agent-conversation/catalog-projects.mjs';
import {catalogPrecheck,catalogIntent,catalogAnswer} from '../supabase/functions/agent-conversation/catalog-knowledge.mjs';
import {nextMaterialHistory} from '../assets/agent-question-plan.mjs';
// Synthetic projects only. Company evidence is held in the existing private catalogue.
const catalog={schema:'wonly-catalog-v1',products:[],sources:[{id:'c1',edition:'2026-08',pages:20},{id:'c2',edition:'2026-08',pages:12},{id:'c3',edition:'2026-08',pages:10},{id:'c4',edition:'2026-08',pages:9}],facts:[{topic:'landmarks',catalog:'c1',page:10,text:'Domestic sample project'}],pages:[
 {catalog:'c1',page:10,text:'Landmark Projects\nSynthetic Cairo project, Egypt\nSynthetic Nairobi project, Kenya'},
 {catalog:'c2',page:7,text:'Reference Projects\nSynthetic Ghana project'},
 {catalog:'c3',page:8,text:'Projects\nSynthetic Paris project, France'},
 {catalog:'c4',page:7,text:'Projects\nSynthetic Congo project'},
 {catalog:'c1',page:11,text:'Egypt sales opportunity. No project declaration.'},
 {catalog:'unlisted',page:1,text:'Landmark Projects\nInvisible Egypt project'}]};
test('natural case questions and PDF citation requests use private catalogue without magic keyword',()=>{
 for(const q of ['非洲有哪些标杆案例','王力在哪些地区有标杆案例，举一下','画册中非洲标杆项目，请附PDF页码','Africa reference projects']){
  assert.equal(catalogPrecheck(q),true,q);assert.equal(catalogIntent(q,catalog).kind,'projects',q);
 }
 for(const q of ['我的项目报价','客户案例合同','本月非洲询盘','竞品在非洲有哪些标杆案例','什么产品适合埃及项目','给我编程案例'])assert.equal(projectQuestion(q),false,q);
});
test('all catalogue sources and all indexed pages are scanned before presentation limits',()=>{
 const q='非洲有哪些标杆案例',r=projectEvidence(projectIntent(q),catalog);
 assert.equal(r.coverage.sources,4);assert.equal(r.coverage.indexed_pages,5);assert.equal(r.coverage.declared_pages,51);
 assert.ok(r.hits.some(h=>h.catalog==='c1'&&h.page===10&&/Egypt/.test(h.quote)));
 assert.ok(r.hits.some(h=>h.catalog==='c2'&&h.page===7));assert.ok(r.hits.some(h=>h.catalog==='c4'&&h.page===7));
 assert.ok(!r.hits.some(h=>h.catalog==='c3'||h.catalog==='unlisted'));
 assert.ok(!r.hits.some(h=>h.page===11));
 const a=catalogAnswer(catalogIntent(q,catalog),catalog,q);assert.match(a,/Egypt/);assert.match(a,/PDF第10页/);assert.match(a,/全部 4 本/);assert.match(a,/索引覆盖不等于全部原页均已解析/);assert.match(a,/对应关系须对照同页版式核实/);
});
test('geography is bounded, and continent search includes country names without literal Africa',()=>{
 const r=projectEvidence(projectIntent('画册里的埃及项目案例'),catalog);assert.ok(r.hits.some(h=>/Egypt/.test(h.quote)));assert.ok(!r.hits.some(h=>h.catalog==='c2'));
 assert.ok(!r.hits.some(h=>/Nairobi/.test(h.quote)));
 const fixtures={...catalog,pages:[{catalog:'c1',page:12,text:'Landmark projects\nSynthetic Nigerialand project'},{catalog:'c2',page:8,text:'Landmark projects\nSynthetic Nigeria project'}]};
 const b=projectEvidence(projectIntent('尼日尔项目案例'),fixtures);assert.equal(b.hits.length,0);
});
test('no match, unavailable index and partial coverage never prove absence of company projects',()=>{
 const q='非洲有哪些标杆案例';const fixture={...catalog,pages:[],facts:[]};const a=catalogAnswer(catalogIntent(q,fixture),fixture,q);
 assert.match(a,/不能据此说公司没有/);assert.match(a,/图片文字、未索引页或其他版本/);assert.match(a,/0 个已索引页面/);
});
test('followup keeps project topic and requested region, and state stores query only',()=>{
 const q='王力在哪些地区有标杆案例';const next=projectTurn('那非洲呢？',[q]);assert.match(next,/非洲.*标杆项目/);
 assert.ok(projectIntent(next).terms.includes('Egypt'));
 const h=nextMaterialHistory({provider:'internal',answer:'PRIVATE SOURCE BODY',context:{route:'catalog',material_question:next}});assert.deepEqual(h,[next]);assert.doesNotMatch(JSON.stringify(h),/PRIVATE/);
 assert.match(projectTurn('来源页码呢？',h),/非洲/);assert.equal(projectTurn('本月询盘怎么样',h),null);
 const country=projectIntent(projectTurn('那埃及呢？',h));assert.equal(country.geography,'埃及');assert.ok(!country.terms.includes('Ghana'));
});
test('matches beyond the former first-six fact limit remain searchable',()=>{
 const fixture={...catalog,pages:Array.from({length:30},(_,i)=>({catalog:'c1',page:i+1,text:i===29?'Landmark projects\nSynthetic Egypt project':'Landmark projects\nSynthetic France project'}))};
 assert.ok(projectEvidence(projectIntent('非洲标杆项目'),fixture).hits.some(h=>h.page===30));
});
test('other supported regions remain filtered instead of returning all Africa projects',()=>{
 const r=projectEvidence(projectIntent('欧洲有哪些标杆项目'),catalog);assert.equal(r.hits.length,1);assert.equal(r.hits[0].catalog,'c3');
});
test('an unrecognized geography never silently widens to all projects',()=>{
 for(const q of ['合成地区有哪些标杆项目','Syntheticland reference projects']){
  const intent=projectIntent(q);assert.equal(intent.literal_geography,true);assert.equal(projectEvidence(intent,catalog).hits.length,0);
  assert.match(catalogAnswer(intent,catalog,q),/不用其他地区的项目代替/);
 }
 assert.equal(projectIntent('王力有哪些标杆案例').literal_geography,false);
});

test('overseas answer lists relevant evidence without empty rows or domestic projects',()=>{
 const c={...catalog,pages:[{catalog:'c1',page:10,text:'项目案例\n埃及合成商务区项目。\n杭州合成工程项目。\n多国使馆。'}],facts:[{topic:'landmarks',catalog:'c1',page:10,text:'埃及合成商务区项目。'}]};
 const q='有哪些海外工程案例';const a=catalogAnswer(catalogIntent(q,c),c,q);
 assert.match(a,/埃及合成商务区项目/);assert.match(a,/PDF第10页/);
 assert.equal(a.split('埃及合成商务区项目').length-1,1);
 assert.doesNotMatch(a,/杭州|多国使馆|原页文字线索|已扫描|查得/);
 assert.ok(a.length<250);
 const follow=projectTurn('来源呢',[q]);assert.equal(projectIntent(follow).overseas,true);
});
test('overseas does not join adjacent country and project lines',()=>{
 const c={...catalog,facts:[],pages:[{catalog:'c1',page:10,text:'项目案例\n埃及\n合成大厦项目'}]};
 const q='有哪些海外工程案例';assert.doesNotMatch(catalogAnswer(catalogIntent(q,c),c,q),/1\. /);
});

test('overseas paraphrases and regional followups keep concise scoped answers',()=>{
 for(const q of ['海外有哪些工程案例','国外有什么项目案例','境外工程案例有哪些','有哪些海外工程案例']){
  const i=projectIntent(q);assert.equal(i.overseas,true);assert.equal(i.literal_geography,false);
 }
 const turn=projectTurn('那埃及呢？',['有哪些海外工程案例']);const i=projectIntent(turn);
 assert.equal(i.overseas,true);assert.equal(i.geography,'埃及');
 const a=catalogAnswer(i,catalog,turn);assert.match(a,/Egypt/);assert.doesNotMatch(a,/Nairobi|France|检索范围|原页文字线索/);
});
test('regional and presentation followups return scoped content and real formats',()=>{
 let prior='有哪些海外工程案例';
 for(const q of ['法国的呢？','列成表格','只要项目名称','具体供货产品呢？','来源呢？']){
  const turn=projectTurn(q,[prior]);assert.ok(turn);const i=projectIntent(turn);const a=catalogAnswer(i,catalog,turn);
  assert.doesNotMatch(a,/Egypt|Nairobi|Ghana|检索范围/);
  if(q==='列成表格')assert.match(a,/\| 项目 \| 来源 \|/);
  if(q==='只要项目名称'){assert.match(a,/Paris/);assert.doesNotMatch(a,/\| 项目/);}
  if(q==='具体供货产品呢？')assert.match(a,/尚未取得项目级证据/);
  assert.match(a,/PDF第8页/);prior=turn;
 }
});
test('geographic task switches must not be swallowed as case followups',()=>{
 for(const q of ['法国天气呢','美国客户报价','埃及产品尺寸','法国适合什么产品','给我法国画册'])assert.equal(projectTurn(q,['海外工程案例']),null,q);
});

import {presentMaterialAnswer} from '../supabase/functions/agent-conversation/material-chinese.mjs';
import {foldQuestionSources} from '../assets/agent-question-windows.mjs';
test('project names survive the final Chinese presenter and citation folding across followups',()=>{
 class Element {constructor(tag){this.tag=tag;this.children=[];this.style={};}append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}}
 const priorDocument=globalThis.document;
 globalThis.document={createElement:tag=>new Element(tag)};
 try{
  let previous='有哪些海外工程案例';
  for(const q of [previous,'法国的呢','列成表格','只要项目名称','来源呢']){
   const resolved=projectTurn(q,[previous])||q;previous=resolved;
   const intent=catalogIntent(resolved,catalog);
   assert.equal(intent.kind,'projects',q);
   const raw=catalogAnswer(intent,catalog,resolved);
   const visible=presentMaterialAnswer(raw,q,catalog,{projectNames:intent.kind==='projects'});
   const node=new Element('div');node.textContent=visible;foldQuestionSources(node);
   const body=node.children.length?node.children.filter(x=>typeof x==='string').join(''):visible;
   assert.match(body,/Synthetic Paris project, France/,q);
   assert.match(visible,/PDF第8页/,q);
   if(q!=='有哪些海外工程案例')assert.doesNotMatch(body,/Cairo|Nairobi|Ghana/,q);
   if(q==='列成表格')assert.match(body,/\| 项目 \| 来源 \|/);
  }
 }finally{globalThis.document=priorDocument}
});

test('folded OCR containing domestic names must not become an overseas project',async()=>{
 const {overseasProjectAnswer}=await import('../supabase/functions/agent-conversation/catalog-projects.mjs');
 const result=overseasProjectAnswer([{catalog:'c1',page:10,quote:'Landmark Projects Nationwide Hangzhou event Beijing airport Synthetic Egypt CBD project'},{catalog:'c1',page:10,quote:'Synthetic Egypt CBD project'}],()=> '工程画册 PDF第10页',{});
 assert.match(result,/1\. Synthetic Egypt CBD project/);assert.doesNotMatch(result,/Nationwide|Hangzhou|Beijing/);
});

test('curated project translation is selected before geography and mixed-row filtering',()=>{
 const c={...catalog,pages:[],facts:[{topic:'landmarks',catalog:'c1',page:10,text:'Synthetic foreign reference',zh:'埃及合成商务区项目。'}]};
 const q='有哪些海外工程案例';const a=catalogAnswer(catalogIntent(q,c),c,q);
 assert.match(a,/埃及合成商务区项目/);assert.doesNotMatch(a,/Synthetic foreign/);
});
