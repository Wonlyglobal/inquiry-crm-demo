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
