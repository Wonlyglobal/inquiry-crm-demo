// Exercise the real HTTP handler with synthetic identity/storage only. All network is denied.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';
import {voiceProof} from '../supabase/functions/agent-conversation/voiceprint.mjs';
const OWNER='c43bd3c2-6e3a-4228-99c7-dc95f33643f2',KEY='synthetic-offline-signing-only';
const catalog={schema:'wonly-catalog-v1',sources:[{id:'c4',edition:'2026-08'}],products:['X60 Pro','X60 Max','S936'].map(model=>({model,catalog:'c4',page:1,category:'smart_lock',specs:{},confidence:'high'}))};
test('authenticated handler preserves context, handles every clause and enforces original voice proof',async t=>{
 const saved={fetch:globalThis.fetch,Deno:globalThis.Deno,client:globalThis.__syntheticCrmClient};let handler;let authCalls=0;let modelEnabled=true;const audits=[],rpcCalls=[];
 globalThis.fetch=()=>{throw Error('Unexpected network in offline test')};
 globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic',DASHSCOPE_API_KEY:KEY,BAILIAN_AGENT_POLICY:modelEnabled?'bailian-public-dialogue-v1':'',VOICEPRINT_ENABLED:'1'}[name])},serve:fn=>{handler=fn}};
 globalThis.__syntheticCrmClient=(url,key,options)=>({auth:{getUser:async()=>{authCalls++;const a=options?.global?.headers?.Authorization;return a==='Bearer owner'?{data:{user:{id:OWNER,email:'chloelee@wonlyglobal.com'}}}:{data:{user:null},error:{message:'unauthorized'}}}},rpc:async(name,args)=>{rpcCalls.push([name,args]);if(name==='sync_agent_private_intelligence')return {data:{receipts:[{id:'private-test',key:'weekly-2026-10-12-2026-10-18',digest:'synthetic-digest'}]}};if(name==='receipt_agent_private_intelligence')return {data:{receipt:{id:args.p_id,key:'weekly-2026-10-12-2026-10-18',digest:'synthetic-digest'}}};return {data:{documents:[{id:'private-test',digest:'synthetic-digest',imported_at:'2026-10-19T00:00:00Z',document:{key:'weekly-2026-10-12-2026-10-18',title:'合成私有周报',generated_at:'2026-10-19T00:00:00Z',period:{from:'2026-10-12',to:'2026-10-18'},sections:[{title:'合成证据',body:'SYNTHETIC-INTERNAL-NOT-FOR-MODEL'}],evidence:[]}}]}}},storage:{from:()=>({download:async()=>({data:new Blob([JSON.stringify(catalog)])})})},from:table=>{const q={select:()=>q,eq:()=>q,gte:()=>q,gt:()=>q,limit:()=>q,order:()=>q,single:async()=>({data:table==='profiles'?{active:true,role:'owner'}:null}),insert:async row=>{audits.push(row);return {error:null}},then:(ok,no)=>Promise.resolve({count:0,data:[],error:null}).then(ok,no)};return q}});
 try{
  const url=new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url);let code=await readFile(url,'utf8');
  code=code.replace("import {createClient} from 'npm:@supabase/supabase-js@2.57.4';",'const createClient=globalThis.__syntheticCrmClient;').replace(/from '(\.[^']+)'/g,(_,path)=>`from '${new URL(path,url).href}'`);
  await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code)).toString('base64'));
  const request=async(question,extra={},token='owner')=>{const res=await handler(new Request('https://example.invalid/functions/v1/agent-conversation',{method:'POST',headers:{Origin:'https://crm.foreverdoodle.com',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'chat',persona:'Grace',question,history:[],...extra})}));return {http:res.status,...await res.json()}};
  await t.test('catalogue answer supplies query context; followup retains variant across three turns',async()=>{
   let r=await request('艾克斯六十Pro。');assert.equal(r.http,200);assert.match(r.context.material_question,/X60/);assert.equal(r.model,'wonly-catalog');
   for(const q of ['那它的安装条件呢','尺寸呢','认证呢']){r=await request(q,{materialHistory:[r.context.material_question]});assert.equal(r.model,'wonly-catalog');assert.match(r.answer,/X60 Pro/);assert.doesNotMatch(r.answer,/请告诉我具体产品型号/)}
   const fresh=await request('那它的安装条件呢');assert.match(fresh.answer,/具体产品型号/);assert.doesNotMatch(fresh.answer,/【X60 Pro】/);
   r=await request('S九三六呢',{materialHistory:[r.context.material_question]});assert.match(r.answer,/S936/);assert.doesNotMatch(r.answer,/【X60 Pro】/);
  });
  await t.test('compound questions rerun authentication and keep product answers internal',async()=>{
   const before=authCalls;const r=await request('介绍我们的CRM系统，并说明新员工跟进询盘的步骤');assert.equal(r.model,'compound-requests');assert.equal(r.context.tasks.length,2);assert.ok(r.context.tasks.every(x=>x.status==='answered'));assert.match(r.answer,/新员工跟进询盘步骤/);assert.equal(authCalls-before,3);assert.equal(r.provider,'internal');
   const p=await request('查询X60 Pro产品信息，并说明安装条件');assert.equal(p.context.tasks.length,2);assert.match(p.answer,/安装与维护：本次画册索引未取得/);assert.match(p.context.material_question,/X60 PRO/);
  });
  await t.test('unsigned voice cannot reach compound dispatch or model lookup',async()=>{
   const before=audits.length;const r=await request('介绍CRM，并说明新员工跟进步骤',{voice:true});assert.equal(r.ignored,'unverified');assert.equal(audits.length,before);
  });
  await t.test('signed original spoken spelling is verified before normalization and split',async()=>{
   const text='介绍CRM，并说明新员工跟进步骤';const sign=async value=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))).toString('hex')};
   const proof=await voiceProof({user:OWNER,speaker:'owner',text},sign);const r=await request(text,{voice:true,voiceProof:proof});assert.equal(r.model,'compound-requests');
   const changed=await request(text+'多一个字',{voice:true,voiceProof:proof});assert.equal(changed.ignored,'unverified');
   const modelText='给我X六十Pro产品信息',modelProof=await voiceProof({user:OWNER,speaker:'owner',text:modelText},sign);const m=await request(modelText,{voice:true,voiceProof:modelProof});assert.equal(m.model,'wonly-catalog');assert.match(m.answer,/X60 Pro/);
  });
  await t.test('private import, receipt and report query stay internal even with model policy off',async()=>{
   modelEnabled=false;
   const imported=await request('',{action:'private-intelligence-import',documents:[{synthetic:true}]});assert.equal(imported.http,200);assert.equal(imported.receipts[0].id,'private-test');
   const receipt=await request('',{action:'private-intelligence-receipt',id:'00000000-0000-4000-8000-000000000001'});assert.equal(receipt.http,200);assert.equal(receipt.receipt.digest,'synthetic-digest');
   const listed=await request('',{action:'private-intelligence-list'});assert.equal(listed.receipts[0].id,'private-test');assert.ok(!JSON.stringify(listed).includes('SYNTHETIC-INTERNAL-NOT-FOR-MODEL'));
   const r=await request('查看上周周报，列出风险和证据');assert.equal(r.model,'private-intelligence');assert.equal(r.provider,'internal');assert.match(r.answer,/SYNTHETIC-INTERNAL-NOT-FOR-MODEL/);assert.equal(r.context.receipts[0].id,'private-test');
   const follow=await request('下一步呢',{privateReportKey:'weekly-2026-10-12-2026-10-18'});assert.equal(follow.model,'private-intelligence');assert.equal(rpcCalls.at(-1)[1].p_key,'weekly-2026-10-12-2026-10-18');assert.match(follow.answer,/2026-10-12—2026-10-18/);
   assert.equal((await request('',{action:'private-intelligence-import',documents:[]},'invalid')).http,401);
   modelEnabled=true;
   const combined=await request('查看上周周报，并介绍我们的CRM系统');assert.equal(combined.model,'compound-requests');assert.equal(combined.context.tasks.length,2);assert.match(combined.answer,/SYNTHETIC-INTERNAL-NOT-FOR-MODEL/);assert.match(combined.answer,/CRM 系统使用说明/);
  });
  await t.test('unverified speech and other speaker never read private reports',async()=>{
   const before=rpcCalls.length;const unsigned=await request('查看上周周报',{voice:true});assert.equal(unsigned.ignored,'unverified');assert.equal(rpcCalls.length,before);
   const text='查看上周周报';const sign=async value=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))).toString('hex')};
   const proof=await voiceProof({user:OWNER,speaker:'other',text},sign);const other=await request(text,{voice:true,voiceProof:proof});assert.equal(other.provider,'internal');assert.equal(other.ignored,'other');assert.equal(rpcCalls.length,before);
   const question='风险呢',privateReportKey='weekly-2026-10-12-2026-10-18';
   const unsignedFollow=await request(question,{voice:true,privateReportKey});assert.equal(unsignedFollow.ignored,'unverified');assert.equal(rpcCalls.length,before);
   const verified=await request(question,{voice:true,privateReportKey,voiceProof:await voiceProof({user:OWNER,speaker:'owner',text:question},sign)});assert.equal(verified.model,'private-intelligence');assert.equal(rpcCalls.at(-1)[1].p_key,privateReportKey);
  });
  await t.test('unauthenticated and client-supplied dispatch flags are rejected',async()=>{
   assert.equal((await request('介绍CRM，并说明新员工跟进步骤',{},'invalid')).http,401);
   assert.equal((await request('介绍CRM',{nested:true})).http,400);
  });
 }finally{globalThis.fetch=saved.fetch;globalThis.Deno=saved.Deno;globalThis.__syntheticCrmClient=saved.client}
});
