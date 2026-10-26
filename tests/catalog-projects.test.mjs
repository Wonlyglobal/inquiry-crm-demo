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
 const q='王力在哪些地区有标杆案例';const next=projectTurn('那非洲呢？',[q]);assert.match(next,/非洲标杆项目/);
 assert.ok(projectIntent(next).terms.includes('Egypt'));
 const h=nextMaterialHistory({provider:'internal',answer:'PRIVATE SOURCE BODY',context:{route:'catalog',material_question:next}});assert.deepEqual(h,[next]);assert.doesNotMatch(JSON.stringify(h),/PRIVATE/);
 assert.match(projectTurn('来源页码呢？',h),/非洲/);assert.equal(projectTurn('本月询盘怎么样',h),null);
});
test('matches beyond the former first-six fact limit remain searchable',()=>{
 const fixture={...catalog,pages:Array.from({length:30},(_,i)=>({catalog:'c1',page:i+1,text:i===29?'Landmark projects\nSynthetic Egypt project':'Landmark projects\nSynthetic France project'}))};
 assert.ok(projectEvidence(projectIntent('非洲标杆项目'),fixture).hits.some(h=>h.page===30));
});
test('other supported regions remain filtered instead of returning all Africa projects',()=>{
 const r=projectEvidence(projectIntent('欧洲有哪些标杆项目'),catalog);assert.equal(r.hits.length,1);assert.equal(r.hits[0].catalog,'c3');
});
