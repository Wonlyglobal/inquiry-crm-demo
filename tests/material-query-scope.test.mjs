import test from 'node:test';
import assert from 'node:assert/strict';
import {materialQuery} from '../supabase/functions/agent-conversation/document-knowledge.mjs';
import {privateV9Turn} from '../supabase/functions/agent-conversation/private-v9-turn.mjs';
import {marketMaterialQuestion} from '../supabase/functions/agent-conversation/product-market.mjs';
import {loadFullMaterials} from '../supabase/functions/agent-conversation/materials.mjs';
import {MATERIAL_ACTOR,verifyMaterialRequest} from '../supabase/functions/agent-conversation/material-request-proof.mjs';

const model='QX80 PRO';
const longText='逐项核对实际配置并保留原文出处，不混合其他产品条件。'.repeat(6);
const scoped=q=>privateV9Turn(q).question;
const scopeIsPreserved=body=>{
 assert.ok(body.query.length<=120);assert.ok(body.terms.length<=6);
 assert.match(body.query,/智能锁画册v9/);assert.match(body.query,/QX80 PRO/i);
 assert.equal(body.constraints.version.toLowerCase(),'v9');
};

test('only a literal material prefix is stripped; colons after a complete model survive',()=>{
 for(const q of ['物料：QX80 PRO：供电','QX80 PRO: power supply','物料: QX80 PRO: battery']){
  const body=materialQuery(q);assert.match(body.query,/QX80 PRO/i);assert.match(body.query,/[:：]/);
 }
 assert.deepEqual(materialQuery('物料：我们X1的防火等级是多少？').terms,['X1','防火']);
});

test('the private V9 turn retains model and edition across a meaningful colon',()=>{
 scopeIsPreserved(materialQuery(scoped('智能锁画册v9 QX80 PRO：开锁方式与供电')));
 const first=privateV9Turn('智能锁画册v9 QX80 PRO：开锁方式');
 const next=privateV9Turn('那它的供电呢',[first.question]);
 scopeIsPreserved(materialQuery(next.question));assert.match(next.question,/供电/);
});

test('long V9 questions reserve scope even when the model occurs after descriptive text',()=>{
 for(const q of ['智能锁画册v9 QX80 PRO '+longText+'安装','智能锁画册v9 '+longText+' QX80 Pro供电']){
  const turn=privateV9Turn(q),body=materialQuery(turn.question);scopeIsPreserved(body);
  assert.ok(turn.question.includes(longText.normalize('NFKC')));
 }
});

test('market-generated V9 requests keep the same complete model and explicit edition',()=>{
 for(const target of ['QX80 PRO','S922','S50 PRO']){
  const body=materialQuery(marketMaterialQuestion('智能锁v9市场分析',target));
  assert.match(body.query,/智能锁画册v9/);assert.ok(body.query.toUpperCase().includes(target));assert.equal(body.constraints.version,'v9');
 }
});

test('pagination and independent constraints are preserved rather than weakened',()=>{
 const body=materialQuery(scoped('智能锁画册v9 QX80 PRO '+longText+' 第2页'));
 scopeIsPreserved(body);assert.equal(body.page,2);
 const constraints=materialQuery('物料：智能锁画册v9 QX80 PRO 防火门英文产品手册 第3页').constraints;
 assert.deepEqual(constraints,{version:'v9',fireDoor:true,english:true,manual:true});
});

test('other editions and categories are never promoted to the private smart-lock V9 scope',()=>{
 for(const q of ['物料：QX80 PRO 智能锁画册v8 安装','物料：QX80 PRO 木门画册v9 材质'])assert.ok(!materialQuery(q).query.includes('智能锁画册v9'));
 assert.equal(materialQuery('物料：QX80 PRO 智能锁画册v8 安装').constraints.version,'v8');
 assert.equal(privateV9Turn('智能锁画册v8 QX80 PRO安装'),null);
 const first=privateV9Turn('智能锁画册v9 QX80 PRO参数');assert.equal(privateV9Turn('那它v8的安装呢',[first.question]),null);
 assert.ok(privateV9Turn('智能锁画册v9 QX80 PRO QX90 MAX参数').clarification);
 const directory=materialQuery('智能锁画册v9型号目录');assert.equal(directory.query,'');assert.deepEqual(directory.terms,[]);
});

test('timestamped file locators remain intact and do not become guessed model anchors',()=>{
 const name='Synthetic_Product_20261026_123456.pdf';
 const body=materialQuery('物料：'+name+' 芯材');assert.ok(body.query.includes(name));assert.ok(!body.query.includes('智能锁画册v9'));
});

test('the actual loader signs a bounded scope-preserving request using an injected source',async()=>{
 // A synthetic key and injected fetcher: no private files, credentials or network.
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const privateJwk=JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey));
 const publicJwk=JSON.stringify(await crypto.subtle.exportKey('jwk',keys.publicKey));
 const question=scoped('智能锁画册v9 '+longText+' QX80 Pro：供电 第2页');let calls=0;
 const result=await loadFullMaterials({actor:MATERIAL_ACTOR,privateJwk,secret:'synthetic',serviceUrl:'https://file.foreverdoodle.com',question},async(url,request)=>{
  calls++;assert.equal(url,'https://file.foreverdoodle.com/api/integrations/crm/knowledge');
  assert.equal(request.redirect,'error');assert.ok(await verifyMaterialRequest({proof:request.headers['X-CRM-Proof'],body:request.body,publicJwk}));
  const body=JSON.parse(request.body);scopeIsPreserved(body);assert.equal(body.page,2);
  assert.deepEqual(Object.keys(body).sort(),['catalogue','constraints','page','query','terms']);
  return Response.json({status:'available',scope:'authorized_material_library',page:2,assets:[]});
 });
 assert.equal(result.status,'available');assert.equal(calls,1);
});
