import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {specIntent,specAnswer} from '../supabase/functions/agent-conversation/catalog-spec.mjs';
test('no-model parameter lookup counts all page candidates before limiting displayed clues',()=>{
 const catalog={products:[],pages:Array.from({length:12},(_,i)=>({catalog:'c1',page:i+1,text:'Synthetic acoustic clue 42 dB. Not assigned to a product.'}))};
 const a=specAnswer(specIntent('木门隔音多少分贝'),catalog);
 assert.match(a,/全部正文页检索找到 12 条数值线索/);assert.equal((a.match(/PDF第/g)||[]).length,3);assert.match(a,/产品归属未确认，不能直接当作该门类参数/);
 assert.match(a,/2026 年 8 月版/);
});
test('parameter miss is an index gap rather than a claim about every original document',()=>{
 const a=specAnswer(specIntent('木门隔音多少分贝'),{products:[],pages:[]});assert.match(a,/不能据此判断原画册没有写明/);
});
test('no-model parameter route shares full-index coverage and the existing signed library lookup',async()=>{
 const s=await readFile(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');const block=s.slice(s.indexOf('   if(spec){'),s.indexOf('   if(!guest&&catalogPrecheck'));
 assert.match(block,/fullCatalogueAnswer\(null,catalog,catalogQuestion\)/);assert.match(block,/loadFullMaterials\(\{\.\.\.materialConfig,question:catalogQuestion\}/);assert.match(block,/search_coverage:fullSearch/);assert.doesNotMatch(block,/body=requestBody|embed\(/);
});
