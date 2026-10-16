import test from 'node:test';import assert from 'node:assert/strict';
import {captureEnrollment} from '../assets/agent-voiceprint-capture.mjs';
function fixture(){
 let time=0,level=0,timer=null,stops=0,closes=0,recorder;
 class Context{state='running';resume=async()=>{};close=async()=>{this.state='closed';closes++};createMediaStreamSource=()=>({connect(){},disconnect(){}});createAnalyser=()=>({fftSize:2048,getFloatTimeDomainData(a){a.fill(level)},disconnect(){}})}
 const options={Context,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++}}]})},makeRecorder:async()=>recorder={mimeType:'audio/wav',state:'inactive',start(){this.state='recording'},stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['synthetic'])});this.onstop?.()})}},now:()=>time,every:cb=>(timer=cb,1),clearEvery:()=>{timer=null}};
 return {options,advance(seconds,sound){level=sound;for(let i=0;i<Math.round(seconds*10);i++){time+=100;timer?.()}},snapshot:()=>({stops,closes,recording:recorder?.state,ticking:!!timer})};
}
async function start(f,extra={}){const promise=captureEnrollment({...f.options,...extra});await new Promise(r=>setImmediate(r));return {promise}}
test('enrollment waits for speech after an initial delay and releases all capture resources',async()=>{
 const f=fixture(),progress=[];const {promise}=await start(f,{onProgress:t=>progress.push(t)});f.advance(8,0);assert.equal(f.snapshot().recording,'recording');
 f.advance(6,.08);f.advance(.7,0);const clip=await promise;assert.equal(clip.mime,'audio/wav');assert.ok(clip.blob.size);assert.match(progress.at(-1),/检测到声音 6.0 秒/);assert.deepEqual(f.snapshot(),{stops:1,closes:1,recording:'inactive',ticking:false});
});
test('silent enrollment stops at twenty seconds without returning an uploadable clip',async()=>{const f=fixture(),{promise}=await start(f);const rejected=assert.rejects(promise,/声音不足，未提交登记/);f.advance(21,0);await rejected;assert.equal(f.snapshot().stops,1);assert.equal(f.snapshot().closes,1)});
test('abort ends enrollment immediately and never returns a partial recording',async()=>{const f=fixture(),controller=new AbortController(),{promise}=await start(f,{signal:controller.signal});const rejected=assert.rejects(promise,/录音已停止/);f.advance(3,.08);controller.abort();await rejected;assert.equal(f.snapshot().ticking,false);assert.equal(f.snapshot().stops,1)});
test('aborting while microphone permission resolves releases the acquired track',async()=>{const f=fixture(),controller=new AbortController();let acquire;f.options.mediaDevices.getUserMedia=()=>new Promise(r=>acquire=r);const p=captureEnrollment({...f.options,signal:controller.signal});const rejected=assert.rejects(p,/录音已停止/);controller.abort();let released=0;acquire({getTracks:()=>[{stop(){released++}}]});await rejected;assert.equal(released,1)});
test('microphone denial does not create recorder, context or progress',async()=>{const f=fixture();f.options.mediaDevices.getUserMedia=async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'})};await assert.rejects(captureEnrollment(f.options),{name:'NotAllowedError'});assert.equal(f.snapshot().recording,undefined);assert.equal(f.snapshot().closes,0)});
