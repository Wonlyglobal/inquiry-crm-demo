import test from 'node:test';import assert from 'node:assert/strict';
import {resolveMaterialTurn,conciseMaterialAnswer} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
import {materialQuery} from '../supabase/functions/agent-conversation/document-knowledge.mjs';
import {knowledgeRoute} from '../supabase/functions/agent-conversation/knowledge-routing.mjs';
const start='物料：SYNTHETIC_CATALOG_20260101 Test Acoustic Door';
test('named product followups retain literal product and document scope across turns',()=>{const a=resolveMaterialTurn('那它的材质呢',[start]);assert.equal(a.clarification,undefined);assert.match(a.question,/SYNTHETIC_CATALOG_20260101 Test Acoustic Door/);assert.match(a.question,/材质/);const b=resolveMaterialTurn('来源和页码呢',[a.question]);assert.match(b.question,/Test Acoustic Door/);assert.equal(knowledgeRoute(b.question).materials,true)});
test('explicit different named product never inherits the previous named target',()=>{const x=resolveMaterialTurn('那Test Hinged Door的材质呢',[start]);assert.match(x.question,/Test Hinged Door/);assert.doesNotMatch(x.question,/Test Acoustic Door/)});
test('two named products and fresh pronouns require clarification',()=>{assert.ok(resolveMaterialTurn('那它材质呢',['物料：Test Acoustic Door 与 Test Hinged Door']).clarification);assert.ok(resolveMaterialTurn('那它材质呢',[]).clarification)});
test('named product search separates parameter labels but preserves limits and negation',()=>{const q=materialQuery(start+' sound insulation 材质');assert.ok(q.terms.includes('Acoustic'));assert.ok(!q.terms.includes('材质'));assert.ok(!q.terms.includes('sound'));const n=resolveMaterialTurn('那它不适合户外零下20度吗',[start]);assert.match(n.question,/不适合户外零下20度/)});
const quote='Test Acoustic Door: synthetic sound insulation 31 dB under laboratory conditions.';
const data={assets:[{id:'synthetic',name:'Synthetic catalogue',versionLabel:'V1',isCurrentVersion:true,document:{status:'partial',knowledge_profile:null,pages:[],product_understanding:{status:'partial',findings:[{product:'Test Acoustic Door',field:'sound insulation',value:'31 dB under laboratory conditions',page:10,quote}]}}}]};
test('specific property includes evidence page, unit, condition and unverified limitation',()=>{const a=conciseMaterialAnswer(data,'物料：Test Acoustic Door 隔音');assert.match(a,/第10页/);assert.match(a,/31 dB under laboratory conditions/);assert.match(a,/原文依据/);assert.match(a,/未人工核验/);assert.match(a,/部分解析/)});
test('unrecorded parameter does not become an unrelated fact or guessed value',()=>{const a=conciseMaterialAnswer(data,'物料：Test Acoustic Door 质保');assert.match(a,/未明确覆盖所问参数/);assert.doesNotMatch(a,/31 dB/)});

test('literal series and trim names also retain source without inventing model aliases',()=>{for(const n of ['Test Wood Series','Test Minimalist Architrave']){const a=resolveMaterialTurn('那它的厚度呢',['物料：'+n]);assert.match(a.question,new RegExp(n));assert.match(a.question,/厚度/);assert.equal(a.clarification,undefined)}});
