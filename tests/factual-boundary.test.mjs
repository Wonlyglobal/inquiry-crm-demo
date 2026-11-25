import {correctedProductQuestion} from '../supabase/functions/agent-conversation/product-model-clarification.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {factualScope,factualGap} from '../supabase/functions/agent-conversation/factual-boundary.mjs';
import {projectTurn} from '../supabase/functions/agent-conversation/catalog-projects.mjs';
import {privateProjectAnswer} from '../supabase/functions/agent-conversation/private-projects.mjs';
import {privateReportQuestion} from '../supabase/functions/agent-conversation/private-report-context.mjs';
import {companyQuestion} from '../supabase/functions/agent-conversation/company-question.mjs';
test('model identity questions and correction do not invent identity, series or certification',()=>{
 for(const q of ['A123Z就是A123 Pro吗？','请问 A123Z 和 A123 Pro 是否同一款？','Is A123Z the same as A123 Pro?']){
 const scope=factualScope(q);assert.equal(scope.relation,true);const a=factualGap(scope);assert.match(a.answer,/不能确认/);assert.doesNotMatch(a.answer,/CE|UKCA|GCC|K系列/);assert.ok(a.answer.length<160);
 const correction=factualGap(factualScope('只说已核实的，不要推测型号关系或认证',[a.context.material_question]));assert.match(correction.answer,/不应采信/);assert.match(correction.answer,/A123Z/);
 const field=factualScope('那认证呢',[a.context.material_question]);assert.equal(field.relation,false);assert.deepEqual(field.fields,['认证']);assert.equal(field.clarifyModel,true);assert.match(factualGap(field).answer,/还是/);
 }
});
test('unrelated turns and explicit entity switches do not recover an old product',()=>{
 assert.equal(factualScope('你好',['事实核对：A123Z就是A123 Pro吗']),null);
 assert.equal(factualScope('你确定吗',['昨天的天气']),null);
 assert.deepEqual(factualScope('B456的尺寸',['事实核对：A123Z就是A123 Pro吗']).models,['B456']);
 for(const q of ['帮我理解HTTP500错误','写一首关于春天的诗','介绍CRM功能'])assert.equal(factualScope(q),null);
});
test('company short field and latest project supply scope survive natural phrasing',()=>{
 assert.equal(companyQuestion('那中文名呢？'),true);
 assert.match(privateReportQuestion('那中文名呢？','evidence-2026-01-01'),/^查看私有知识/);
 for(const q of ['供了什么产品？','那供的哪些产品呢','用了什么门？']){
 const resolved=projectTurn(q,['画册 海外 埃及的呢 标杆项目']);assert.match(resolved,/埃及/);assert.match(resolved,/具体供货产品/);
 assert.equal(projectTurn(q,['A123尺寸']),null);
 }
});

test('comparison does not masquerade as model identity',()=>{for(const q of ['A123和B456有什么区别','A123和B456是否有认证','difference between A123 and B456'])assert.equal(factualScope(q).relation,false);});

test('selecting a model after factual clarification retains only requested fields',()=>{assert.equal(correctedProductQuestion('A123 Pro',['事实核对：A123Z就是A123 Pro吗；那认证呢']),'A123 PRO；认证');assert.equal(correctedProductQuestion('B456',['事实核对：A123Z就是A123 Pro吗；那认证呢']),'B456；认证');assert.equal(correctedProductQuestion('A123 Pro',['无关话题']),null);});

test('short English followups retain the latest product scope',()=>{for(const q of ['certification','what about certification','and warranty']){const scope=factualScope(q,['事实核对：A123Z same as A123 Pro']);assert.equal(scope.clarifyModel,true);assert.ok(scope.fields.length);}});
