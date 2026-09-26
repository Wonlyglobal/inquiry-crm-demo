import test from 'node:test';
import assert from 'node:assert/strict';
import {mountConversation} from '../assets/agent-conversation.mjs';
class Element{children=[];value='';style={};dataset={};querySelector(){return {after(){}}}append(...nodes){this.children.push(...nodes);if(!this.value&&nodes[0]?.value)this.value=nodes[0].value}prepend(...nodes){this.children.unshift(...nodes)}setAttribute(){}}
class Recognition{static instances=[];static async available(){return 'available'}start(){Recognition.instances.push(this)}abort(){this.aborted=true}}
Recognition.prototype.processLocally=false;
function setup(invoke=async()=>({enabled:true,configured:true,model:'test'})){
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}}});
 const events={},states=[];Recognition.instances=[];globalThis.document={hidden:false,createElement:()=>new Element(),addEventListener(name,handler){events[name]=handler}};globalThis.window={SpeechRecognition:Recognition,addEventListener(){}};
 const host=new Element();let persona='Grace';const model=mountConversation(host,{invoke,getPersona:()=>persona,isAllowed:()=>true,onMode(){},onMessage(){},onTranscript(){},onSelectPersona(){},onStatus:text=>states.push(text)});
 return {model,host,events,states,setPersona:p=>persona=p};
}
test('opening Grace preloads a fixed greeting and starts local wake without sending recordings or chat',async()=>{
 const calls=[];const {model}=setup(async body=>{calls.push([body.action,body.kind]);return {enabled:true,configured:true,model:'test'}});
 try{await model.enter();assert.equal(model.isModel(),true);assert.equal(Recognition.instances.length,1);assert.equal(Recognition.instances[0].processLocally,true);assert.deepEqual(calls,[['status',undefined],['greeting','wake'],['greeting','ack'],['greeting','offer']])}finally{model.reset()}
});
test('leaving Grace before connection completes prevents late microphone activation',async()=>{
 let resolve;const {model}=setup(()=>new Promise(r=>resolve=r));const pending=model.enter();model.reset();resolve({enabled:true,configured:true});await pending;assert.equal(Recognition.instances.length,0);
});
test('other rooms and hidden pages do not auto-start Grace wake',async()=>{
 const {model,setPersona}=setup();setPersona('Brian');await model.enter();setPersona('Grace');document.hidden=true;await model.enter();assert.equal(Recognition.instances.length,0);model.reset();
});

test('active wake is not cancelled by changing browser tab visibility',async()=>{
 const {model,events}=setup();await model.enter();document.hidden=true;events.visibilitychange?.();assert.equal(Recognition.instances[0].aborted,undefined);model.reset();assert.equal(Recognition.instances[0].aborted,true);
});

test('slow response gives feedback before five seconds and cancellation clears it',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let finish;
 const {model,states}=setup(body=>body.action==='chat'?new Promise(r=>finish=r):Promise.resolve({enabled:true,configured:true}));
 await model.enter();const pending=model.ask('解释黑洞');assert.match(states.at(-1),/收到/);t.mock.timers.tick(4500);assert.match(states.at(-1),/仍在处理/);model.reset();finish({answer:'合成回答',model:'test'});await pending;t.mock.timers.tick(10000);assert.equal(states.at(-1),'已停止');
});
