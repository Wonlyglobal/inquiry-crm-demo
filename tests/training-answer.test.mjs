import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingPassages,trainingAnswer} from '../supabase/functions/agent-conversation/training-answer.mjs';
import {documentTopicMatch} from '../supabase/functions/agent-conversation/document-topic.mjs';
import {resolveMaterialTurn} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
test('training followups retain scope without inventing a model or carrying a stale topic',()=>{
 const next=resolveMaterialTurn('那怎么保养？',['木门安装要求']);
 assert.equal(next.question,'物料：木门 怎么保养?');assert.equal(next.clarification,undefined);
 assert.equal(resolveMaterialTurn('留缝多少？',[next.question]).question,'物料：木门 留缝多少?');
 assert.equal(resolveMaterialTurn('智能锁怎么保养？',['木门安装要求']).question.includes('木门'),false);
 assert.equal(resolveMaterialTurn('怎么保养？',[]).question,'怎么保养?');
 assert.notEqual(resolveMaterialTurn('怎么保养？',['木门与智能锁对比']).question,'物料：木门 怎么保养?');
});
test('maintenance retains precautions and the distinction between hinge and lock lubrication',()=>{
 const source='一、日常使用\n1. 保持通风干燥。\n2. 避免冲击。\n二、维护和保养\n1. 清洁用软布。\n2. 合页响声应注油，锁孔使用铅笔粉。不可随便注油。';
 assert.deepEqual(trainingPassages([source],'木门怎么保养'),[source]);
});
test('thickness stays attached to the source configuration, excluding unrelated configuration rows',()=>{
 const source='A配置说明：\n1、颜色为白色；\n2、门扇厚度40mm；\n3、五金另选。';
 const answer=trainingPassages([source],'木门厚度').join('\n');
 assert.match(answer,/A配置说明：\n2、门扇厚度40mm/);assert.doesNotMatch(answer,/白色|五金/);
});
test('acceptance does not retrieve a generic hardware configuration',()=>{
 assert.equal(documentTopicMatch(['产品五金配置标准'],'木门验收留缝').score,0);
 assert.equal(trainingPassages(['产品五金配置标准'],'木门验收留缝').length,0);
});
test('ungated data and superseded sources cannot become training answers',()=>{
 const asset={name:'木门培训',isCurrentVersion:false,document:{pages:[{page:1,chunks:['厚度40mm']}]}};
 assert.equal(trainingAnswer({assets:[asset]},'木门厚度'),null);
 assert.equal(trainingAnswer({evidence_gate:{version:1},assets:[asset]},'木门厚度'),null);
});

import {materialQuery} from '../supabase/functions/agent-conversation/document-knowledge.mjs';
import {knowledgeRoute} from '../supabase/functions/agent-conversation/knowledge-routing.mjs';
test('training uses internal retrieval and selects a topic term before the source page limit',()=>{
 for(const [q,term] of [['木门如何保养','维护和保养'],['木门验收留缝','空隙'],['木门1.0和2.0厚度','门扇厚度']]){
  assert.equal(knowledgeRoute(q).materials,true);
  const request=materialQuery(q);
  assert.equal(request.query,'木门');
  assert.deepEqual(request.terms,[term]);
 }
});

import {nativeProductTurn} from '../supabase/functions/agent-conversation/private-product-knowledge.mjs';
test('wood training switches away from a prior lock and keeps the new scope on follow-up',()=>{
 const lock='私有产品：TEST80 PRO；尺寸';
 const wood='木门怎么保养';
 assert.equal(resolveMaterialTurn(wood,[lock]).question,wood);
 assert.equal(nativeProductTurn(wood,[lock]),null);
 assert.equal(nativeProductTurn('那厚度呢',[lock,wood]),null);
 assert.equal(resolveMaterialTurn('那厚度呢',[lock,wood]).question,'物料：木门 厚度呢');
 assert.equal(nativeProductTurn('那后面板尺寸呢',[lock])?.model,'TEST80 PRO');
});
