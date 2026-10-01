import {readFileSync} from "node:fs";
import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {voiceprintCall,voiceprintUrl,sanitize,speakerOf,voiceProof,readVoiceProof,enrollmentReply,guestInstruction,VOICEPRINT_PATH} from '../supabase/functions/agent-conversation/voiceprint.mjs';
import {signMaterialRequest,verifyMaterialRequest,MATERIAL_ACTOR} from '../supabase/functions/agent-conversation/material-request-proof.mjs';
import {validateDialogue} from '../supabase/functions/agent-conversation/policy.mjs';
const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const privateJwk=JSON.stringify(await webcrypto.subtle.exportKey('jwk',pair.privateKey)),publicJwk=JSON.stringify(await webcrypto.subtle.exportKey('jwk',pair.publicKey));
const sign=async t=>(await import('node:crypto')).createHmac('sha256','k').update(t).digest('hex');const cfg={actor:MATERIAL_ACTOR,privateJwk,serviceUrl:'https://file.foreverdoodle.com:8088',secret:'s'};
const audio=new Uint8Array(5000).fill(7);

test('proofs are bound to their route: a voiceprint proof is rejected on the knowledge route and vice versa',async()=>{
 const body='{"op":"status"}';const p=await signMaterialRequest({body,actor:MATERIAL_ACTOR,privateJwk,path:VOICEPRINT_PATH});
 assert.ok(await verifyMaterialRequest({proof:p,body,publicJwk,path:VOICEPRINT_PATH}));assert.equal(await verifyMaterialRequest({proof:p,body,publicJwk}),null);
 const k=await signMaterialRequest({body,actor:MATERIAL_ACTOR,privateJwk});assert.equal(await verifyMaterialRequest({proof:k,body,publicJwk,path:VOICEPRINT_PATH}),null);
 await assert.rejects(signMaterialRequest({body,actor:MATERIAL_ACTOR,privateJwk,path:'/api/other'}),/path_denied/);
});
test('calls go only to the material host, signed, and never return the embedding',async()=>{
 assert.equal(voiceprintUrl('https://evil.example.com'),null);assert.equal(voiceprintUrl('http://file.foreverdoodle.com'),null);assert.match(voiceprintUrl('https://file.foreverdoodle.com:8088/x?y'),/:8088\/api\/integrations\/crm\/voiceprint$/);
 let seen;const f=async(url,init)=>{seen={url,init};return new Response(JSON.stringify({status:'ok',speaker:'owner',score:0.71234,embedding:[1,2,3],samples:3}))};
 const r=await voiceprintCall({...cfg,op:'verify',audio,mime:'audio/webm'},f);
 assert.equal(r.speaker,'owner');assert.equal(r.score,0.712);assert.equal(r.embedding,undefined);
 assert.ok(await verifyMaterialRequest({proof:seen.init.headers['X-CRM-Proof'],body:seen.init.body,publicJwk,path:VOICEPRINT_PATH}));
 assert.equal(JSON.parse(seen.init.body).op,'verify');
 assert.equal((await voiceprintCall({...cfg,op:'verify',audio:new Uint8Array(10),mime:'audio/webm'},f)).status,'invalid_audio');
 assert.equal((await voiceprintCall({...cfg,serviceUrl:''},f)).status,'invalid');
 assert.equal((await voiceprintCall({...cfg,op:'status',serviceUrl:''},f)).status,'not_configured');
 assert.equal((await voiceprintCall({...cfg,op:'status'},async()=>{throw Error('down')})).status,'unavailable');
 assert.equal(speakerOf({status:'unavailable'}),'unavailable');assert.equal(speakerOf(sanitize({status:'ok',speaker:'hacker'})),'unavailable');
});
test('voice proof binds speaker to user, transcript and time',async()=>{
 const p=await voiceProof({user:'u1',speaker:'other',text:'你好 Grace',now:1000},sign);
 assert.equal(await readVoiceProof(p,{user:'u1',question:'你好 Grace',now:2000},sign),'other');
 assert.equal(await readVoiceProof(p,{user:'u1',question:'给我看CRM数据',now:2000},sign),null);
 assert.equal(await readVoiceProof(p,{user:'u2',question:'你好 Grace',now:2000},sign),null);
 assert.equal(await readVoiceProof(p,{user:'u1',question:'你好 Grace',now:400000},sign),null);
 assert.equal(await readVoiceProof({...p,data:p.data.replace('other','owner')},{user:'u1',question:'你好 Grace',now:2000},sign),null);
});
test('policy accepts a voice proof only for voice questions; guest mode wording',()=>{
 const base={action:'chat',persona:'Grace',question:'你好',history:[]};
 assert.doesNotThrow(()=>validateDialogue({...base,voice:true,voiceProof:{data:'{}',signature:'x'}}));
 assert.throws(()=>validateDialogue({...base,voiceProof:{data:'{}',signature:'x'}}),/凭据/);
 assert.throws(()=>validateDialogue({...base,voice:true,voiceProof:'x'}),/凭据/);
 assert.match(guestInstruction,/只能回答公开、通用/);assert.match(guestInstruction,/Chloe 本人/);
 assert.match(enrollmentReply({status:'ok',samples:1,required:3}),/还需要 2 段/);assert.match(enrollmentReply({status:'ok',samples:3,required:3}),/注册完成/);
 assert.match(enrollmentReply({status:'ok',deleted:3}),/已删除/);assert.match(enrollmentReply({status:'not_configured'}),/没有接通/);
});
import {ignoredSpeaker} from '../supabase/functions/agent-conversation/voiceprint.mjs';
test('only Chloe is processed: others, uncertain and unverifiable voices are dropped before transcription',()=>{
 for(const s of ['other','uncertain','unavailable'])assert.equal(ignoredSpeaker(s),true,s);
 for(const s of ['owner','not_enrolled'])assert.equal(ignoredSpeaker(s),false,s);
 const src=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 const i=src.indexOf("if(ignoredSpeaker(heard))return json({text:''"),j=src.indexOf('transcriptionBody(audioBytes');
 assert.ok(i>0&&j>0,'gate present');
 assert.match(src,/input\.voice===true&&Deno\.env\.get\('VOICEPRINT_ENABLED'\)==='1'&&\(speaker===null\|\|ignoredSpeaker\(speaker\)\)\)return json\(\{ignored/);
 assert.match(enrollmentReply({status:'ok',samples:3,required:3}),/别人的声音我不转写、不回答、不记录/);
});
