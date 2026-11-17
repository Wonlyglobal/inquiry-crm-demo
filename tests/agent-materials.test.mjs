import test from 'node:test';import assert from 'node:assert/strict';import {loadFullMaterials,fullMaterialAnswer} from '../supabase/functions/agent-conversation/materials.mjs';import {knowledgeRoute} from '../supabase/functions/agent-conversation/knowledge-routing.mjs';
import {MATERIAL_ACTOR,verifyMaterialRequest} from '../supabase/functions/agent-conversation/material-request-proof.mjs';
const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicJwk=JSON.stringify(await crypto.subtle.exportKey('jwk',keys.publicKey));
const config={actor:MATERIAL_ACTOR,privateJwk:JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey)),secret:'synthetic',serviceUrl:'https://file.foreverdoodle.com:8088',question:'物料：手册'};
test('full catalogue uses the fixed source and passes body-bound signed proof; drops identities',async()=>{assert.equal(knowledgeRoute('帮我找到英语产品手册').materials,true);const result=await loadFullMaterials(config,async(url,o)=>{assert.equal(url,'https://file.foreverdoodle.com:8088/api/integrations/crm/knowledge');assert.equal(o.headers['X-CRM-Authorization'],undefined);assert.ok(await verifyMaterialRequest({proof:o.headers['X-CRM-Proof'],body:o.body,publicJwk}));assert.equal(JSON.parse(o.body).query,'手册');return Response.json({status:'available',scope:'authorized_material_library',page:1,assets:[{id:'a',name:'synthetic',visibility:'internal',uploadedBy:'PRIVATE',storedName:'PRIVATE',excerpt:'synthetic text'}]})});assert.equal(result.status,'available');assert.equal(result.assets[0].visibility,'internal');assert.equal(JSON.stringify(result.assets).includes('PRIVATE'),false);assert.match(fullMaterialAnswer(result),/没有发送给外部模型/)});
test('wrong hosts, credentials in URL, missing config and failed auth cannot return catalogue',async()=>{for(const serviceUrl of ['https://evil.example','http://file.foreverdoodle.com','https://secret@file.foreverdoodle.com',''])assert.equal((await loadFullMaterials({...config,serviceUrl},()=>assert.fail())).status,'not_configured');assert.equal((await loadFullMaterials(config,async()=>new Response('',{status:403}))).status,'unavailable')});
test('a limited marketing response cannot be represented as full catalogue',async()=>{const result=await loadFullMaterials(config,async()=>Response.json({assets:[{id:'a'}]}));assert.equal(result.status,'unavailable');assert.match(fullMaterialAnswer(result),/不能把营销资料目录当作全库/)});
test('video evidence preserves time and labels inferred frames, drops unsafe fields',async()=>{const result=await loadFullMaterials(config,async()=>Response.json({status:'available',scope:'authorized_material_library',page:1,assets:[{id:'v',name:'synthetic',type:'视频',video:{status:'partial',private:'hidden',segments:[{kind:'speech',start:65,text:'synthetic speech'},{kind:'visual_inference',start:80,text:'synthetic scene'},{kind:'instruction',start:1,text:'bad'},{kind:'speech',start:-1,text:'bad'}]}}]}));const answer=fullMaterialAnswer(result);assert.match(answer,/1:05 语音转写/);assert.match(answer,/画面推测/);assert.match(answer,/部分解析/);assert.equal(result.assets[0].video.segments.length,2);assert.equal(JSON.stringify(result).includes('hidden'),false)});

test('series directory instructions do not filter out all citation files',async()=>{
 const result=await loadFullMaterials({...config,question:'请介绍我们的产品系列目录，列出资料来源、版本和页码。'},async(url,o)=>{const b=JSON.parse(o.body);assert.equal(b.query,'');assert.deepEqual(b.terms,[]);assert.equal(b.catalogue,true);assert.equal(b.page,1);assert.ok(await verifyMaterialRequest({proof:o.headers['X-CRM-Proof'],body:o.body,publicJwk}));return Response.json({status:'available',scope:'authorized_material_library',assets:[{id:'a',name:'Synthetic v7',versionLabel:'V7',isCurrentVersion:true,document:{status:'ready',pages_total:1,sha256:'a'.repeat(64),pages:[{page:1,chunks:['Synthetic']} ]}}],series_catalogue:{series:[],categories:[]}})});
 assert.equal(result.assets.length,1);assert.ok(result.series_catalogue);
});

test('transient transport failure retries once with a fresh signed nonce and unchanged request',async()=>{
 const calls=[];
 const result=await loadFullMaterials(config,async(url,o)=>{
  calls.push({url,body:o.body,claims:await verifyMaterialRequest({proof:o.headers['X-CRM-Proof'],body:o.body,publicJwk})});
  if(calls.length===1)throw new DOMException('synthetic timeout','TimeoutError');
  return Response.json({status:'available',scope:'authorized_material_library',assets:[]});
 });
 assert.equal(result.status,'available');assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].url,calls[1].url);
 assert.equal(calls[0].claims.sub,calls[1].claims.sub);assert.notEqual(calls[0].claims.jti,calls[1].claims.jti);
});
test('transport retry is bounded and never retries authorization or malformed responses',async()=>{
 for(const mode of ['network','denied','malformed']){
  let count=0;const result=await loadFullMaterials(config,async()=>{count++;if(mode==='network')throw new TypeError('synthetic network');return mode==='denied'?new Response('',{status:403}):Response.json({status:'available',assets:[]});});
  assert.equal(result.status,'unavailable');assert.equal(count,mode==='network'?2:1);assert.deepEqual(result.assets,[]);
 }
});

test('body transport failure retries complete read with fresh proof',async()=>{
 const proofs=[];let n=0;
 const result=await loadFullMaterials(config,async(url,o)=>{
  proofs.push(o.headers['X-CRM-Proof']);
  if(++n===1)return new Response(new ReadableStream({start(c){c.error(new TypeError('synthetic interrupted body'))}}));
  return Response.json({status:'available',scope:'authorized_material_library',assets:[]});
 });assert.equal(result.status,'available');assert.equal(n,2);assert.notEqual(proofs[0],proofs[1]);
});
test('transient gateways retry once but auth rate-limit and invalid JSON do not',async()=>{
 for(const status of [502,503,504,401,403,429]){let n=0;const result=await loadFullMaterials(config,async()=>++n===1?new Response('',{status}):Response.json({status:'available',scope:'authorized_material_library',assets:[]}));assert.equal(n,[502,503,504].includes(status)?2:1);assert.equal(result.status,n===2?'available':'unavailable');}
 let n=0;await loadFullMaterials(config,async()=>{n++;return new Response('{invalid')});assert.equal(n,1);
});
