import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogPrecheck,catalogIntent,fullCatalogueAnswer} from '../supabase/functions/agent-conversation/catalog-knowledge.mjs';
import {catalogueWordingQuestion} from '../supabase/functions/agent-conversation/catalog-sales.mjs';

const fixture={
 sources:[{id:'c2',edition:'2026-08'}],
 products:[{model:'TEST90',catalog:'c2',page:8,specs:{Power:'6 V only in dry rooms'}}],
 pages:[{catalog:'c2',page:3,text:'The plant was designated Future Factory.'},
  {catalog:'c2',page:8,text:'TEST90 — 6 V only in dry rooms'}],
 facts:[{topic:'factory',catalog:'c2',page:3,text:'The plant was designated Future Factory.'},
  {topic:'capacity',catalog:'c2',page:3,text:'The factory capacity is 10,000 units.'}]
};
const run=(q,c=fixture)=>fullCatalogueAnswer(catalogIntent(q,c),c,q).answer;
test('brand fact lookup distinguishes factory designation from locations and marks unaligned quotes',()=>{
 assert.equal(catalogPrecheck('王力的智能工厂，画册怎么介绍？'),true);
 assert.match(run('王力的智能工厂，画册怎么介绍？'),/画册原文.*Future Factory.*PDF第3页/);
 assert.match(run('王力的产能，画册怎么介绍？'),/原页待核对.*PDF第3页/);
});
test('catalogue wording keeps source limitations and leaves unrelated drafting alone',()=>{
 assert.equal(catalogueWordingQuestion('帮我写一段催款话术'),false);
 const q='给王力 TEST90 的供电写一句产品话术';
 assert.match(run(q),/建议话术.*TEST90.*6 V only in dry rooms/);
 assert.match(run(q),/零售画册 PDF第8页/);
 assert.match(run('Write a short customer-facing line for WONLY TEST90 about Power.'),/Suggested customer-facing line.*6 V only in dry rooms/);
 assert.match(run('给王力 TEST90 的质保写一句产品话术'),/暂未找到.*可引用原文/);
 assert.match(run(q,{...fixture,pages:[]}),/暂未找到.*可引用原文/);
});
test('conflicting pages do not yield a single customer claim',()=>{
 const second={model:'TEST90',catalog:'c2',page:9,specs:{Power:'9 V in dry rooms'}};
 const expanded={...fixture,products:[...fixture.products,second],pages:[...fixture.pages,{catalog:'c2',page:9,text:'TEST90 9 V in dry rooms'}]};
 const answer=run('给王力 TEST90 的供电写一句产品话术',expanded);
 assert.match(answer,/有不同字段或表述/);
 assert.match(answer,/第8页/);
 assert.match(answer,/第9页/);
 assert.doesNotMatch(answer,/建议话术/);
});
