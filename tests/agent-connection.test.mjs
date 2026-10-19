import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionCheck,connectionFailure,retryableConnection} from '../assets/agent-connection.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const ok={enabled:true,configured:true};
test('transient initial failure recovers once, shares concurrent checks and keeps ready evidence',async()=>{
 let calls=0,rt=0,finish;const retries=[];
 const c=createConnectionCheck({status:async()=>{if(++calls===1)throw TypeError('Failed to fetch');return new Promise(r=>finish=r)},realtimeStatus:async()=>{rt++;return {ready:true}},sleep:async()=>{},onRetry:r=>retries.push(r)});
 const a=c.check(),b=c.check();assert.equal(a,b);await tick();finish(ok);const result=await a;assert.equal(calls,2);assert.equal(rt,1);assert.equal(result.core,ok);assert.equal(result.realtime.ready,true);assert.equal(result.diagnostics.core.attempts,2);assert.deepEqual(retries,[{source:'core',attempt:1,next:2}]);assert.equal(c.pending,false);
});
test('HTTP auth, rate limit and policy failures never retry or report readiness',async()=>{
 for(const status of [400,401,403,429]){let calls=0;const c=createConnectionCheck({status:async()=>{calls++;throw Object.assign(Error('refused'),{status})},sleep:async()=>{assert.fail()}});const r=await c.check();assert.equal(calls,1);assert.equal(r.core,null);assert.equal(r.error.status,status);assert.equal(r.diagnostics.core.reason.status,status)}
 for(const value of [{enabled:false,configured:true},{enabled:true,configured:false}]){let n=0;const c=createConnectionCheck({status:async()=>{n++;return value}});assert.deepEqual((await c.check()).core,value);assert.equal(n,1)}
});
test('realtime readiness failure does not erase text readiness or imply a voice service success',async()=>{
 let rt=0;const c=createConnectionCheck({status:async()=>ok,realtimeStatus:async()=>{rt++;throw TypeError('Load failed')},sleep:async()=>{}});const r=await c.check();assert.equal(rt,3);assert.equal(r.core,ok);assert.equal(r.realtime,null);assert.equal(r.realtimeFailed,true);assert.equal(r.diagnostics.realtime.reason.kind,'network');assert.doesNotMatch(JSON.stringify(r.diagnostics),/token|Failed|Load|https/);
});
test('cancelled connection rejects no user action and cannot publish late readiness into next check',async()=>{
 let finish,n=0;const c=createConnectionCheck({status:()=>++n===1?new Promise(r=>finish=r):Promise.resolve(ok)});const old=c.check();c.cancel();const fresh=c.check();finish({enabled:false});assert.deepEqual(await old,{cancelled:true});assert.equal((await fresh).core,ok);assert.equal(c.pending,false);
});
test('hung initial request has a bounded timeout and cancellation clears its timer',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const c=createConnectionCheck({status:()=>new Promise(()=>{}),timeoutMs:100,attempts:1});const p=c.check();t.mock.timers.tick(100);const r=await p;assert.equal(r.diagnostics.core.reason.kind,'timeout');assert.equal(r.error.connectionTimeout,true);
 const pending=c.check();c.cancel();assert.deepEqual(await pending,{cancelled:true});t.mock.timers.tick(1000);
});
test('loss of current authorization prevents retries and late ready states',async()=>{
 let allowed=true,finish;const c=createConnectionCheck({isAllowed:()=>allowed,status:()=>new Promise(r=>finish=r)});const p=c.check();allowed=false;finish(ok);assert.deepEqual(await p,{cancelled:true});
 assert.equal(connectionFailure(Object.assign(Error('private payload'),{status:503})).kind,'http');assert.equal(retryableConnection(Object.assign(Error(),{status:503})),true);assert.equal(retryableConnection(Error('invalid policy')),false);
});

test('real page transports preserve gateway HTTP errors and stop after a cancelled session lookup',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const name of ['index.html','grace.html']){
  const html=await readFile(new URL('../'+name,import.meta.url),'utf8');const code=html.slice(html.indexOf('realtimeRequest:async'),html.indexOf('onSelectPersona:name=>',html.indexOf('realtimeRequest:async'))).trim().replace(/,$/,'');
  const client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-only'}}})}};let fetches=0;
  const get=new Function('supabase','fetch',`return ({${code}}).realtimeRequest`);
  const request=get(client,async()=>{fetches++;return {ok:false,status:503,json:async()=>{throw SyntaxError('html gateway')}}});await assert.rejects(request('status'),e=>e.status===503&&retryableConnection(e));assert.equal(fetches,1);
  let finish;client.auth.getSession=()=>new Promise(r=>finish=r);const control=new AbortController(),waiting=request('status',control.signal);control.abort();finish({data:{session:{access_token:'synthetic-only'}}});await assert.rejects(waiting,/停止/);assert.equal(fetches,1);
 }
});
