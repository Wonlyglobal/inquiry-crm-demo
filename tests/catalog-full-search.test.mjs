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
 assert.equal(fullCatalogueAnswer(null,null,'画册'),null);
});
