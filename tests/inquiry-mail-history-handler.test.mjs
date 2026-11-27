import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../supabase/functions/inquiry-mail-history/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const id='00000000-0000-4000-8000-000000000001';
function handler({logged=true,role='owner',visible=true}={}){
 let serve;const calls=[];const client={auth:{async getUser(){calls.push('getUser');return logged?{data:{user:{id}}}:{error:true,data:{}}}},from(table){return{select(){return this},eq(){return this},async single(){calls.push(table);return table==='profiles'?{data:{id,role,active:true,data_environment:'production'}}:visible?{data:{id,owner_id:id}}:{error:true}}}},async rpc(name,args){calls.push({name,args});return {data:name==='start_inquiry_mail_history'?id:{}}}};
 vm.runInNewContext(source,{Response,JSON,createClient(){calls.push('client');return client},withReadOnlyGuard:fn=>fn,ImapFlow:class{},simpleParser:async()=>{},processHistoryChunk:async()=>({done:true}),Deno:{env:{get(name){return name==='MAIL_SYNC_WORKER_TOKEN'?'synthetic-worker-value':name==='SUPABASE_URL'?'https://example.invalid':'synthetic-only'}},serve(fn){serve=fn}}});return{serve,calls};
}
const request=(body,headers={})=>new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('anonymous and wrong worker tokens cannot read or start mailbox history',async()=>{
 const h=handler({logged:false});assert.equal((await h.serve(request({action:'start'}))).status,401);assert.equal((await h.serve(request({action:'worker_tick'},{'x-mail-sync-token':'wrong'}))).status,401);assert.equal(h.calls.some(c=>typeof c==='object'&&c.name==='start_inquiry_mail_history'),false);
});
test('the verified profile, role, inquiry scope and exact90day request are checked before service action',async()=>{
 let h=handler({role:'marketing'});assert.equal((await h.serve(request({action:'start',inquiry_id:id,request_id:id,days:90}))).status,403);
 h=handler({visible:false});assert.equal((await h.serve(request({action:'start',inquiry_id:id,request_id:id,days:90}))).status,403);
 h=handler();assert.equal((await h.serve(request({action:'start',inquiry_id:id,request_id:id,days:91}))).status,400);
 const r=await h.serve(request({action:'start',inquiry_id:id,request_id:id,days:90,actor_id:'forged'}));assert.equal(r.status,200);assert.equal(h.calls.find(c=>typeof c==='object'&&c.name==='start_inquiry_mail_history').args.actor_id,id);assert.equal(h.calls[1],'getUser');
});
test('worker token only continues previously authorized work and never starts a job from request data',async()=>{
 const h=handler();const r=await h.serve(request({action:'start',inquiry_id:id},{'x-mail-sync-token':'synthetic-worker-value'}));assert.equal(r.status,200);assert.equal((await r.json()).idle,true);assert.equal(h.calls.includes('getUser'),false);assert.deepEqual(h.calls.filter(c=>typeof c==='object').map(c=>c.name),['next_inquiry_mail_history_request']);
});
