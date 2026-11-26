import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {learningQuestion,learningReply,LEARNING_ROW_PREFIX} from '../supabase/functions/agent-conversation/learning-questions.mjs';
import {loadFullMaterials} from '../supabase/functions/agent-conversation/materials.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
import {MATERIAL_ACTOR} from '../supabase/functions/agent-conversation/material-request-proof.mjs';

const title='门窗全员产品知识学习（第二阶段）';
const name=title+'1234567890123456789(1).xlsx';
const request=learningQuestion(`按《${title}》填空题第 １ 题，型号和厚度分别是什么？`);
const chunk=LEARNING_ROW_PREFIX+'填空题第1题｜'+JSON.stringify({row:4,values:['示例系列','7 mm']});
const page={page:4,kind:'sheet_cells',chunks:[chunk],facts:[],truncated:false};
const asset={name,visibility:'internal',relativePath:'WONLYS素材/公司文件/学习资料/'+name,isCurrentVersion:true,
 document:{status:'ready',sha256:'b'.repeat(64),pages_total:5,pages:[page]}};
const available=(...assets)=>({status:'available',scope:'authorized_material_library',assets});

test('A named learning exercise takes the signed material path and emits the answer and row locator',async()=>{
 assert.equal(request.type,'填空题');
 assert.deepEqual(request.retrieval,{query:'门窗全员产品知识学习',terms:['门窗全员产品知识学习','学习题库行 填空题第1题｜'],page:1,constraints:{}});
 const keyPair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const privateJwk=JSON.stringify(await crypto.subtle.exportKey('jwk',keyPair.privateKey));
 const config={actor:MATERIAL_ACTOR,privateJwk,serviceUrl:'https://file.foreverdoodle.com',secret:'synthetic',
  question:request.label,retrieval:request.retrieval};
 const fetcher=async(url,options)=>{
  assert.equal(new URL(url).pathname,'/api/integrations/crm/knowledge');
  assert.ok(options.headers['X-CRM-Proof']);
  assert.deepEqual(JSON.parse(options.body).terms,request.retrieval.terms);
  return Response.json(available(asset));
 };
 const authorized=gateMaterialEvidence(await loadFullMaterials({...config,learning:true},fetcher));
 const reply=learningReply(authorized,request);
 assert.equal(reply.status,'answered');
 assert.equal(reply.answer,`示例系列、7 mm。\n出处：《${name}》· 填空题第1题（第 4 行）`);
 const generic=gateMaterialEvidence(await loadFullMaterials(config,fetcher));
 assert.deepEqual(generic.assets[0].document.pages,[]);
});

test('The learning route does not hijack downloads, open topic questions, or unrelated numbered requests',()=>{
 assert.equal(learningQuestion(`下载《${name}》`),null);
 assert.equal(learningQuestion('尚品推拉门最厚是几毫米？'),null);
 assert.equal(learningQuestion('安全门画册填空题第1题'),null);
 assert.equal(learningQuestion(`《${name}》填空题第1题和填空题第2题`).clarify,true);
 const entry=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.ok(entry.includes('if(!namedFile&&!catalogueReference&&!exercise&&'));
 assert.ok(entry.indexOf('if(!guest&&exercise)')<entry.indexOf('if(!guest&&namedFile)'));
});

test('Absent, stale, duplicate, unverified or wrong-sheet sources fail without a guessed answer',()=>{
 assert.equal(learningReply({status:'unavailable'},request).status,'unavailable');
 assert.equal(learningReply(available({...asset,isCurrentVersion:false}),request).status,'source_gap');
 assert.equal(learningReply(available(asset,asset),request).status,'source_gap');
 assert.equal(learningReply(available({...asset,relativePath:'public/'+name}),request).status,'source_gap');
 const wrongSheet={...asset,document:{...asset.document,pages:[{...page,page:2}]}};
 assert.equal(learningReply(available(wrongSheet),request).status,'row_gap');
 const stale={...asset,document:{...asset.document,status:'failed'}};
 assert.equal(learningReply(gateMaterialEvidence(available(stale)),request).status,'row_gap');
});
