import test from 'node:test';import assert from 'node:assert/strict';
import {searchCatalogue,catalogueSearchCoverage} from '../supabase/functions/agent-conversation/catalog-search.mjs';
import {fullCatalogueAnswer,catalogPrecheck,catalogIntent} from '../supabase/functions/agent-conversation/catalog-knowledge.mjs';
const fixture={schema:'wonly-catalog-v1',sources:[{id:'c1',pages:50},{id:'c2',pages:40}],products:[{catalog:'c2',page:30,model:'TEST-998',specs:{Material:'Synthetic steel'}}],facts:[{catalog:'c1',page:2,topic:'patents',text:'Synthetic patent fact'}],pages:Array.from({length:35},(_,i)=>({catalog:i%2?'c1':'c2',page:i+1,text:i===34?'Synthetic rareword evidence':'Synthetic ordinary text'}))};
test('full search scans every source record before ranking and rendering limits',()=>{
 const r=searchCatalogue('画册 rareword',fixture);assert.equal(r.coverage.records_searched,37);assert.equal(r.coverage.indexed_pages,35);assert.equal(r.hits[0].page,35);assert.match(catalogueSearchCoverage(r),/全部 2 本/);
});
test('all product and corporate questions search complete page, fact and product collections',()=>{
 const q='王力的专利情况';assert.ok(catalogPrecheck(q));const a=fullCatalogueAnswer(catalogIntent(q,fixture),fixture,q);assert.equal(a.coverage.records_searched,37);assert.match(a.answer,/Synthetic patent fact/);
 const b=fullCatalogueAnswer(null,fixture,'画册 TEST-998');assert.match(b.answer,/PDF第30页/);assert.equal(b.coverage.matches,1);
});
test('unknown catalogue question is kept internal with explicit no-match coverage rather than model guess',()=>{
 const a=fullCatalogueAnswer(null,fixture,'画册 nonexistentword');assert.match(a.answer,/不能据此回答“没有”/);assert.equal(a.coverage.matches,0);assert.match(a.coverage_text,/未解析页/);
 const failed=fullCatalogueAnswer(null,null,'画册 PRIVATE-QUESTION');assert.equal(failed.status,'unavailable');assert.equal(failed.coverage,null);assert.match(failed.answer,/不会改用外部模型/);assert.doesNotMatch(failed.answer,/PRIVATE-QUESTION/);
});
test('unlisted Chinese company and product subjects search every source without a magic keyword',()=>{
 const c={...fixture,pages:[...fixture.pages,{catalog:'c1',page:44,text:'仅合成数据：特殊复合涂层工艺。'}]};
 for(const q of ['王力采用什么特殊复合涂层工艺','锁具采用什么特殊复合涂层工艺']){
  assert.equal(catalogPrecheck(q),true);const a=fullCatalogueAnswer(catalogIntent(q,c),c,q);
  assert.ok(a.coverage.terms.includes('涂层'));assert.equal(a.coverage.records_searched,38);assert.match(a.answer,/PDF第44页/);
 }
 for(const q of ['WONLY manufacturing technology','What material properties do wooden doors have?','木门厚度请附PDF页码'])assert.equal(catalogPrecheck(q),true,q);
 for(const q of ['我们本月客户询盘统计','本月社媒帖子数据','我们的营销策略分析','WONLY monthly inquiry statistics','WONLY marketing strategy'])assert.equal(catalogPrecheck(q),false,q);
 assert.equal(catalogIntent('TEST-998的参数请附PDF页码',fixture)?.kind,'models');
 assert.equal(catalogPrecheck('下载非洲标杆案例画册'),false);
 assert.equal(catalogIntent('下载非洲标杆案例画册',fixture),null);
});
