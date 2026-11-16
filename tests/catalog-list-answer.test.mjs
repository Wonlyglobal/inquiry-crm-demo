import test from 'node:test';import assert from 'node:assert/strict';
import {conciseCatalogList} from '../supabase/functions/agent-conversation/catalog-list-answer.mjs';
test('list answer is bounded, relevant and preserves evidence limits',()=>{
 const catalog={sources:[{id:'c4',edition:'Synthetic V1'}],products:[...Array.from({length:20},(_,i)=>({model:'TEST'+i,category:'locks',catalog:'c4',page:i+1})),{model:'UNRELATED',category:'doors',catalog:'c3',page:1}]};
 const a=conciseCatalogList({kind:'list',categories:['locks']},catalog,{status:'available'});
 assert.match(a,/TEST0/);assert.match(a,/20 个型号/);assert.match(a,/先列 12/);assert.match(a,/Synthetic V1/);assert.match(a,/第1、2/);assert.match(a,/尚未人工核验/);assert.doesNotMatch(a,/UNRELATED|检索覆盖|竞品/);assert.ok(a.length<600);
 assert.match(conciseCatalogList({kind:'list',categories:['locks']},catalog,{status:'unavailable'}),/补充检索未完成/);
 assert.equal(conciseCatalogList({kind:'models'},catalog,null),null);
 assert.match(conciseCatalogList({kind:'list',categories:['none']},catalog,null),/不代表没有/);
});
