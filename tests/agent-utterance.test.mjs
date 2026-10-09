import test from 'node:test';import assert from 'node:assert/strict';import {captureUtterance} from '../assets/agent-utterance.mjs';
test('cancel while microphone permission pending releases late stream',async()=>{
 let acquired,stopped=0;const c=new AbortController();const pending=captureUtterance({signal:c.signal,onState:()=>{},mediaDevices:{getUserMedia:()=>new Promise(r=>acquired=r)},Recorder:class{},Context:class{}});
 c.abort();await assert.rejects(pending,/停止/);acquired({getTracks:()=>[{stop(){stopped++}}]});await new Promise(r=>setImmediate(r));assert.equal(stopped,1);
});
test('silence returns no audio and releases microphone; speech returns one clip',async t=>{
 t.mock.timers.enable({apis:['setInterval','setTimeout','Date']});let level=0,stopped=0,starts=0;
 class C{state='running';resume(){return Promise.resolve()}close(){return Promise.resolve()}createMediaStreamSource(){return {connect(){},disconnect(){}}}createAnalyser(){return {fftSize:8,getFloatTimeDomainData(a){a.fill(level)}}}}
 class R{static isTypeSupported(){return true}state='inactive';start(){starts++;this.state='recording'}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'])});this.onstop?.()}}
 const options={signal:new AbortController().signal,onState:()=>{},mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++}}]})},Recorder:R,Context:C};
 let p=captureUtterance(options);await Promise.resolve();await Promise.resolve();t.mock.timers.tick(30000);assert.equal(await p,null);assert.equal(starts,0);assert.equal(stopped,1);
 p=captureUtterance(options);await Promise.resolve();await Promise.resolve();level=0.1;for(let i=0;i<6;i++)t.mock.timers.tick(50);level=0;for(let i=0;i<30;i++)t.mock.timers.tick(50);const blob=await p;assert.ok(blob.size>0);assert.equal(starts,1);assert.equal(stopped,2);
});
