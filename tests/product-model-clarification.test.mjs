import test from 'node:test';
import assert from 'node:assert/strict';
import {productModelClarification,correctedProductQuestion} from '../supabase/functions/agent-conversation/product-model-clarification.mjs';
import {nativeProductTurn,nativeProductAnswer} from '../supabase/functions/agent-conversation/private-product-knowledge.mjs';
import {presentMaterialAnswer} from '../supabase/functions/agent-conversation/material-chinese.mjs';

test('incomplete numeric variant asks one short question without guessing an alias',()=>{
 const c=productModelClarification('80 Max的供电方式和材质是什么？');
 assert.ok(c.answer.length<90);assert.match(c.answer,/供电、材质/);
 assert.doesNotMatch(c.answer,/S80|X80|内部测试|竞品/);
 const t=nativeProductTurn('T80',[c.material_question]);
 assert.equal(t.model,'T80');assert.match(t.question,/供电、材质/);assert.doesNotMatch(t.question,/MAX/);
 const a=nativeProductAnswer({facts:[],receipts:[],gaps:[]},t).answer;
 assert.match(a,/供电与电池/);assert.match(a,/材质/);assert.doesNotMatch(a,/尺寸|开锁方式/);
});
test('validated parameter values survive concise presentation even when another field is unknown',()=>{
 const a=presentMaterialAnswer('T80 MAX：\n- 供电：尚未核实。\n材质：\n- 合成测试材质\n 来源：Synthetic.pdf，第71页，V1','T80 Max供电和材质',null,{parameterAnswer:true});
 assert.match(a,/合成测试材质/);assert.match(a,/供电：尚未核实/);assert.match(a,/第71页/);
 const b=presentMaterialAnswer('材质：\n- synthetic composite XYZ','T80材质',null,{parameterAnswer:true});assert.match(b,/synthetic composite XYZ/);
 for(const q of ['battery?','material?','warranty?'])assert.equal(nativeProductTurn(q,['私有产品：T80 MAX；供电、材质'])?.model,'T80 MAX');
});
test('explicit correction preserves requested fields and never inherits another variant or edition',()=>{
 for(const q of ['T81','型号是T81','改为 T81']){
  const t=nativeProductTurn(q,['私有产品：T80 MAX V9；供电、材质']);
  assert.equal(t.model,'T81');assert.equal(t.edition,'');assert.match(t.question,/供电、材质/);
 }
 assert.equal(nativeProductTurn('T81 Pro',['私有产品：T80 MAX；供电'])?.model,'T81 PRO');
 assert.match(correctedProductQuestion('T81',['资料任务：T80供电']),/供电/);
});
test('no stale-topic resurrection, quantity confusion, or full-model interception',()=>{
 for(const q of ['T80 Max的供电是什么','60 mm尺寸合适吗','供电60 V吗','80 Max','有哪些公司信息'])assert.equal(productModelClarification(q),null);
 assert.equal(correctedProductQuestion('T81',['私有产品：T80；供电','公司介绍']),null);
 assert.equal(correctedProductQuestion('T81',[]),null);
 assert.equal(correctedProductQuestion('T81的尺寸',['私有产品：T80；供电']),null);
});
test('a panel-only followup inherits dimensions only from the current dimension question',()=>{
 for(const q of ['后面板呢？','前面板呢','rear panel?','what about front panel?']){
  const turn=nativeProductTurn(q,['私有产品：T80 MAX；尺寸']);assert.equal(turn?.model,'T80 MAX');assert.match(turn.question,/尺寸/);
 }
 assert.equal(nativeProductTurn('后面板呢？',['私有产品：T80 MAX；供电']),null);
 assert.equal(nativeProductTurn('后面板呢？',['私有产品：T80 MAX；尺寸','公司介绍']),null);
});
