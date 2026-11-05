import test from 'node:test';
import assert from 'node:assert/strict';
import {privateReportQuestion} from '../assets/agent-private-report-context.mjs';
import {nativeProductTurn} from '../supabase/functions/agent-conversation/private-product-knowledge.mjs';
import {resolveMaterialTurn} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
import {materialFields} from '../supabase/functions/agent-conversation/product-input.mjs';
test('company attributes and source followups keep one evidence selector without assuming an entity',()=>{
 for(const q of ['那成立时间呢','它的经营范围是什么','请问这家公司的注册地址是什么','那中文名称呢','原表出处呢'])assert.match(privateReportQuestion(q,'evidence-2026-01-02'),/查看私有知识 evidence-2026-01-02/);
 for(const q of ['另一家公司的注册地址呢','微软的成立时间呢','今天的经营范围是什么','新需求：成立时间呢'])assert.equal(privateReportQuestion(q,'evidence-2026-01-02'),q);
});
test('product everyday wording keeps full model and edition across successive fields',()=>{
 let history=['私有产品：TEST80 PRO V9；参数'];
 for(const q of ['保修多久','那它是什么材料做的','请问怎么供电','那么它多厚呢','出处在哪一页','还有哪些缺口']){
  const t=nativeProductTurn(q,history);assert.equal(t?.model,'TEST80 PRO',q);assert.equal(t.edition,'V9');assert.ok(t.question.includes(q));history=['私有产品：'+t.question];
 }
 const t=nativeProductTurn('换成TEST81 Pro的保修呢',history);assert.equal(t.model,'TEST81 PRO');
 const v=nativeProductTurn('那V8的保修呢',history);assert.equal(v.edition,'V8');
 for(const q of ['那家公司有哪些认证','新需求：保修多久','介绍CRM','那天气怎么样'])assert.equal(nativeProductTurn(q,history),null);
 assert.equal(nativeProductTurn('保修多久',[]),null);
});
test('ordinary material fields preserve meaning and clarify ambiguous products',()=>{
 for(const q of ['多厚','什么材料做的','保修多久','怎么供电','隔声多少分贝']){
  assert.ok(materialFields(q).length,q);assert.match(resolveMaterialTurn(q,['物料：TEST80 PRO V9 参数']).question,/TEST80 PRO/);
 }
 assert.ok(resolveMaterialTurn('那它保修多久',['物料：TEST80 TEST81']).clarification);
});
