import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {specIntent,specAnswer,catalogueTurn} from '../supabase/functions/agent-conversation/catalog-spec.mjs';
test('no-model parameter lookup counts all page candidates before limiting displayed clues',()=>{
 const catalog={products:[],pages:Array.from({length:12},(_,i)=>({catalog:'c1',page:i+1,text:'Synthetic acoustic clue 42 dB. Not assigned to a product.'}))};
 const a=specAnswer(specIntent('木门隔音多少分贝'),catalog);
 assert.match(a,/全部正文页检索找到 12 条数值线索/);assert.equal((a.match(/PDF第/g)||[]).length,3);assert.match(a,/产品归属未确认，不能直接当作该门类参数/);
 assert.match(a,/2026 年 8 月版/);
});
test('parameter miss is an index gap rather than a claim about every original document',()=>{
 const a=specAnswer(specIntent('木门隔音多少分贝'),{products:[],pages:[]});assert.match(a,/不能据此判断原画册没有写明/);
});
test('PDF page citation requests do not disable parameter retrieval',()=>{
 assert.equal(specIntent('木门隔音多少分贝，请附PDF页码').dim,'acoustic');
 assert.equal(specIntent('下载木门隔音PDF'),null);
});
test('no-model parameter route shares full-index coverage and the existing signed library lookup',async()=>{
 const s=await readFile(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');const block=s.slice(s.indexOf('   if(spec){'),s.indexOf('   if(!guest&&catalogPrecheck'));
 assert.match(block,/fullCatalogueAnswer\(null,catalog,catalogQuestion\)/);assert.match(block,/loadFullMaterials\(\{\.\.\.materialConfig,question:catalogQuestion\}/);assert.match(block,/search_coverage:fullSearch/);assert.doesNotMatch(block,/body=requestBody|embed\(/);
});
test('query-only catalogue context retains ordinary sources and changes the requested parameter or category',()=>{
 assert.equal(catalogueTurn('来源页码呢？',['画册检索：王力采用哪些制造技术']),'王力采用哪些制造技术 来源页码呢？');
 const dimension=catalogueTurn('那厚度呢？',['画册检索：木门隔音多少分贝']);assert.equal(specIntent(dimension).cat,'wooden_door');assert.equal(specIntent(dimension).dim,'thickness');
 const category=catalogueTurn('那防盗门呢？',['画册检索：木门隔音多少分贝']);assert.equal(specIntent(category).cat,'security_door');assert.equal(specIntent(category).dim,'acoustic');
 for(const q of ['今天询盘怎样','今天天气怎样','TEST998参数'])assert.equal(catalogueTurn(q,['画册检索：木门隔音多少分贝']),null);
 assert.equal(catalogueTurn('来源页码呢？',[]),null);
});
