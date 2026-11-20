import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogIntent,fullCatalogueAnswer} from '../supabase/functions/agent-conversation/catalog-knowledge.mjs';
const facts=[
 {topic:'lock_core',catalog:'c2',page:62,text:'Test Core Above Class C'},
 {topic:'lock_core',catalog:'c2',page:62,text:'Test 120 minutes of resistance'},
 {topic:'lock_core',catalog:'c4',page:11,text:'Other catalogue 12x'},
];
const fixture={products:[],facts,sources:[{id:'c2',edition:'2026-08'}],pages:facts.map(f=>({...f})),conflicts:[{topic:'lock_core_ratio',label:'test',statements:[{catalog:'c4',page:11,text:'12x'}]}]};
const run=q=>fullCatalogueAnswer(catalogIntent(q,fixture),fixture,q).answer;
test('a requested catalogue page stays concise and excludes unrelated pages',()=>{
 const a=run('零售画册第62页的锁芯等级是什么？请看原文并注明出处。');
 assert.ok(a.length<300,a);
 assert.match(a,/Test Core Above Class C/);
 assert.match(a,/2026-08.*零售画册 PDF第62页/);
 assert.match(a,/待产品负责人确认/);
 assert.match(a,/倍数口径有差异/);
 assert.doesNotMatch(a,/Other catalogue|第11页|检索覆盖|SELECT|provider|```/);
});
test('unavailable page and wrong catalogue never borrow another citation',()=>{
 for(const q of ['零售画册第61页的锁芯等级','工程画册第62页的锁芯等级']){
  const a=run(q);assert.match(a,/指定页暂未找到/);assert.doesNotMatch(a,/Test Core|第62页|12x/);
 }
});
test('raw code and unaligned summaries cannot masquerade as original text',()=>{
 const c={...fixture,facts:[{...facts[0],text:'{"raw":"code"}'}]};
 assert.doesNotMatch(fullCatalogueAnswer(catalogIntent('王力锁芯等级',c),c,'王力锁芯等级').answer,/raw|code/);
 const d={...fixture,pages:[]};
 const a=fullCatalogueAnswer(catalogIntent('王力锁芯等级原文',d),d,'王力锁芯等级原文').answer;
 assert.match(a,/原页待核对/);assert.doesNotMatch(a,/画册原文/);
});
