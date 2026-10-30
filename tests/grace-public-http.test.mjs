import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicHttp} from '../supabase/functions/grace-public/http.mjs';
const ref='aaaaaaaaaaaaaaaaaaaa';
function fixture({authenticated=true,active=true,quota=true,fail=false}={}) {
 const calls=[];
 const handle=createPublicHttp({projectRef:ref,anonKey:'public',serviceKey:'server',modelKey:'model',fetcher:async(url,options)=>{
  calls.push({url,options});
  if(fail)throw Error('SECRET must not leak');
  if(url.endsWith('/auth/v1/user'))return Response.json(authenticated?{id:'user',email_confirmed_at:'2026-10-30'}:{},{status:authenticated?200:401});
  if(url.endsWith('grace_public_account'))return Response.json(active);
  if(url.endsWith('grace_public_consume'))return Response.json(quota);
  return Response.json({choices:[{message:{content:'hello'}}]});
 }});
 return {calls,handle};
}
function request(body={action:'chat',question:'hello',history:[]},origin='https://crm.foreverdoodle.com'){
 return new Request('https://example.com',{method:'POST',headers:{Origin:origin,Authorization:'Bearer test'},body:JSON.stringify(body)});
}
test('cannot configure the adapter against CRM or website',()=>{for(const projectRef of ['plhverjihjilnuhlhlxi','rpiviiyvbpwslyxywqcd','invalid'])assert.throws(()=>createPublicHttp({projectRef}))});
test('public auth is validated by the separate project and quota precedes AI',async()=>{const f=fixture();const response=await f.handle(request());assert.equal(response.status,200);assert.equal((await response.json()).answer,'hello');assert.deepEqual(f.calls.map(x=>new URL(x.url).pathname),['/auth/v1/user','/rest/v1/rpc/grace_public_account','/rest/v1/rpc/grace_public_consume','/compatible-mode/v1/chat/completions']);assert.ok(f.calls.slice(0,3).every(x=>new URL(x.url).hostname===`${ref}.supabase.co`));assert.equal(JSON.parse(f.calls[3].options.body).max_tokens,1500)});
test('foreign token, disabled account and exhausted quota never call model',async()=>{for(const config of [{authenticated:false},{active:false},{quota:false}]){const f=fixture(config);assert.ok([401,429].includes((await f.handle(request())).status));assert.ok(f.calls.every(x=>!x.url.includes('maas.aliyuncs.com')))}});
test('bad origin, oversized body and invalid JSON rejected before auth',async()=>{const f=fixture();assert.equal((await f.handle(request({},'https://evil.test'))).status,403);assert.equal((await f.handle(request({question:'x'.repeat(100001)}))).status,413);assert.equal((await f.handle(new Request('https://example.com',{method:'POST',body:'{'}))).status,400);assert.equal(f.calls.length,0)});
test('upstream failure is sanitized and never cached',async()=>{const f=fixture({fail:true});const response=await f.handle(request());assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.ok(!(await response.text()).includes('SECRET'))});
