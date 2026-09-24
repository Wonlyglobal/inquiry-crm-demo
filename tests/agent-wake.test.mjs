import test from 'node:test';import assert from 'node:assert/strict';
import {wakeName,endPhrase,createWakeConversation} from '../assets/agent-wake.mjs';
test('wake accepts exact hello plus one approved name, not background mentions',()=>{
 for(const name of ['Grace','Brian','Jay'])assert.equal(wakeName('Hello '+name+'!'),name);
 for(const text of ['Grace','hello Bob','we said hello Jay yesterday','Hello Jay send quotes'])assert.equal(wakeName(text),null);
 assert.equal(endPhrase('结束对话'),true);
});
class FakeRecognition{static instances=[];static async available(){return 'available'}constructor(){FakeRecognition.instances.push(this)}start(){this.started=true}abort(){this.aborted=true}}FakeRecognition.prototype.processLocally=false;
const say=(r,text)=>r.onresult({results:[Object.assign([{transcript:text}],{isFinal:true})]});
test('background stays local; greeting completes before dialogue recognition resumes',async()=>{
 FakeRecognition.instances=[];const calls=[];let finishGreeting;
 const w=createWakeConversation({Recognition:FakeRecognition,onState:()=>{},onWake:async n=>{calls.push(n);await new Promise(r=>finishGreeting=r)},onQuestion:async q=>calls.push(q)});
 try{await w.start();const r=FakeRecognition.instances.at(-1);assert.equal(r.processLocally,true);assert.equal(r.lang,'en-US');await say(r,'background conversation');assert.deepEqual(calls,[]);
 const pending=say(r,'Hello Brian');assert.equal(r.aborted,true);assert.equal(FakeRecognition.instances.length,1);finishGreeting();await pending;
 const d=FakeRecognition.instances.at(-1);assert.equal(d.lang,'zh-CN');await say(d,'如何确认需求');assert.deepEqual(calls,['Brian','如何确认需求']);await say(FakeRecognition.instances.at(-1),'结束对话');assert.equal(w.isActive(),false);
 }finally{w.stop()}
});
test('unsupported on-device recognition never falls back to cloud recognition',async()=>{
 const w=createWakeConversation({Recognition:class {},onState:()=>{},onWake:()=>assert.fail(),onQuestion:()=>assert.fail()});await assert.rejects(w.start(),/不支持本机/);assert.equal(w.isActive(),false);
});
test('cancel during greeting does not restart the microphone',async()=>{
 FakeRecognition.instances=[];let finish;const w=createWakeConversation({Recognition:FakeRecognition,onState:()=>{},onWake:()=>new Promise(r=>finish=r),onQuestion:()=>assert.fail()});await w.start();const pending=say(FakeRecognition.instances[0],'Hello Grace');w.stop();finish();await pending;assert.equal(FakeRecognition.instances.length,1);assert.equal(w.isActive(),false);
});
test('downloadable packs are installed explicitly and never activate microphone automatically',async()=>{
 class Downloadable extends FakeRecognition{static ready=false;static async available(){return this.ready?'available':'downloadable'}static async install(options){assert.deepEqual(options.langs,['en-US','zh-CN']);this.ready=true;return true}}
 FakeRecognition.instances=[];const states=[];const w=createWakeConversation({Recognition:Downloadable,onState:s=>states.push(s),onWake:()=>{},onQuestion:()=>{}});
 await assert.rejects(w.start(),/安装本机语音包/);await w.install();assert.equal(w.isActive(),false);assert.equal(FakeRecognition.instances.length,0);assert.match(states.at(-1),/已就绪/);await w.start();assert.equal(w.isActive(),true);w.stop();
});
test('unsupported Chinese pack is identified instead of telling users to install an unavailable pack',async()=>{
 class NoChinese extends FakeRecognition{static async available({langs}){return langs[0]==='zh-CN'?'unavailable':'available'}static install(){assert.fail('unsupported pack cannot be installed')}}
 const w=createWakeConversation({Recognition:NoChinese,onState:()=>{},onWake:()=>{},onQuestion:()=>{}});await assert.rejects(w.start(),/不支持中文/);await assert.rejects(w.install(),/不支持中文/);assert.equal(w.isActive(),false);
});

test('a failed answer keeps dialogue active until explicit stop',async()=>{
 FakeRecognition.instances=[];const states=[];const w=createWakeConversation({Recognition:FakeRecognition,onState:s=>states.push(s),onWake:async()=>{},onQuestion:async()=>{throw Error('temporary failure')}});
 try{await w.start();await say(FakeRecognition.instances.at(-1),'Hello Grace');await say(FakeRecognition.instances.at(-1),'分析');assert.equal(w.isActive(),true);assert.match(states.at(-1),/继续聆听/);}finally{w.stop()}
});

test('runtime language rejection repairs only failed local language once',async()=>{
 const installs=[];class Repairable extends FakeRecognition{static async install(o){installs.push(o);return true}}
 FakeRecognition.instances=[];const states=[];const w=createWakeConversation({Recognition:Repairable,onState:s=>states.push(s),onWake:async()=>{},onQuestion:async()=>{}});
 try{await w.start();await say(FakeRecognition.instances.at(-1),'Hello Grace');await FakeRecognition.instances.at(-1).onerror({error:'language-not-supported'});assert.deepEqual(installs,[{langs:['zh-CN'],processLocally:true}]);assert.equal(FakeRecognition.instances.at(-1).lang,'zh-CN');assert.equal(FakeRecognition.instances.at(-1).processLocally,true);await FakeRecognition.instances.at(-1).onerror({error:'language-not-supported'});assert.equal(w.isActive(),false);assert.match(states.at(-1),/中文对话/);assert.equal(installs.length,1)}finally{w.stop()}
});
test('leaving while a language repair is pending never restarts recognition',async()=>{
 let finish;class Repairable extends FakeRecognition{static install(){return new Promise(r=>finish=r)}}
 FakeRecognition.instances=[];const w=createWakeConversation({Recognition:Repairable,onState:()=>{},onWake:async()=>{},onQuestion:async()=>{}});await w.start();const pending=FakeRecognition.instances.at(-1).onerror({error:'language-not-supported'});w.stop();finish(true);await pending;assert.equal(FakeRecognition.instances.length,1);assert.equal(w.isActive(),false);
});

test('approved cloud dialogue checks only English and starts after greeting; stop aborts capture',async()=>{
 const langs=[];class EnglishOnly extends FakeRecognition{static async available(o){langs.push(...o.langs);return o.langs[0]==='en-US'?'available':'unavailable'}}
 FakeRecognition.instances=[];let greetingDone,captureSignal,reads=0;
 const w=createWakeConversation({Recognition:EnglishOnly,onState:()=>{},onWake:()=>new Promise(r=>greetingDone=r),onQuestion:()=>assert.fail(),readQuestion:signal=>{reads++;captureSignal=signal;return new Promise(()=>{})}});
 await w.start();assert.deepEqual(langs,['en-US']);await say(FakeRecognition.instances[0],'background');assert.equal(reads,0);
 const pending=say(FakeRecognition.instances[0],'Hello Grace');assert.equal(reads,0);greetingDone();await pending;assert.equal(reads,1);assert.equal(FakeRecognition.instances.length,1);w.stop();assert.equal(captureSignal.aborted,true);
});
test('cloud exit phrase never becomes a model question',async()=>{
 FakeRecognition.instances=[];const w=createWakeConversation({Recognition:FakeRecognition,onState:()=>{},onWake:async()=>{},onQuestion:()=>assert.fail(),readQuestion:async()=> '结束对话'});
 await w.start();await say(FakeRecognition.instances[0],'Hello Grace');await new Promise(r=>setImmediate(r));assert.equal(w.isActive(),false);
});
test('cloud transcription failure stops rather than repeatedly uploading',async()=>{
 FakeRecognition.instances=[];let count=0;const w=createWakeConversation({Recognition:FakeRecognition,onState:()=>{},onWake:async()=>{},onQuestion:()=>assert.fail(),readQuestion:async()=>{count++;throw Error('offline')}});
 await w.start();await say(FakeRecognition.instances[0],'Hello Grace');await new Promise(r=>setImmediate(r));assert.equal(w.isActive(),false);assert.equal(count,1);
});
