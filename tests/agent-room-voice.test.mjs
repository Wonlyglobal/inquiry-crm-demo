import test from 'node:test';
import assert from 'node:assert/strict';
import {mountConversation} from '../assets/agent-conversation.mjs';
class Element{children=[];value='';style={};dataset={};dispatchEvent(){}querySelector(){return {after(){}}}append(...nodes){this.children.push(...nodes);if(!this.value&&nodes[0]?.value)this.value=nodes[0].value}prepend(...nodes){this.children.unshift(...nodes)}setAttribute(){}}
class Recognition{static instances=[];static async available(){return 'available'}start(){Recognition.instances.push(this)}abort(){this.aborted=true}}
Recognition.prototype.processLocally=false;
function setup(invoke=async()=>({enabled:true,configured:true,model:'test'}),options={}){
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}}});
 const events={},states=[],messages=[];Recognition.instances=[];globalThis.document={hidden:false,createElement:()=>new Element(),addEventListener(name,handler){events[name]=handler}};globalThis.window={SpeechRecognition:Recognition,addEventListener(){}};
 const host=new Element();let persona='Grace';const model=mountConversation(host,{invoke,getPersona:()=>persona,isAllowed:()=>true,onMode(){},onMessage:(role,text)=>messages.push({role,text}),onTranscript(){},onSelectPersona(){},onStatus:text=>states.push(text),...options});
 return {model,host,events,states,messages,setPersona:p=>persona=p};
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

test('mobile text reconnects after an interrupted initial status check',async()=>{
 let completeInitial;let statuses=0;const calls=[];
 const {model,messages}=setup(body=>{calls.push(body.action);if(body.action==='status'){if(++statuses===1)return new Promise(r=>completeInitial=r);return Promise.resolve({enabled:true,configured:true})}return Promise.resolve({answer:'Synthetic reply',context:{route:'conversation'}})}, {autoVoice:false});
 const entering=model.enter();model.stop();completeInitial({enabled:true,configured:true});await entering;
 await model.ask('Synthetic question');
 assert.deepEqual(calls,['status','status','chat']);assert.equal(messages.at(-1).text.trim(),'Synthetic reply');model.stop();
});
test('mobile reports failed reconnect without silently requesting chat or microphone',async()=>{
 const {model,states}=setup(async()=>{throw Error('Network unavailable')},{autoVoice:false});await model.enter();
 await model.ask('Synthetic question');assert.equal(states.at(-1),'Network unavailable');
 await model.record();assert.equal(states.at(-1),'Network unavailable');model.stop();
});
test('busy question gives feedback and does not send a duplicate request',async()=>{
 let finish;let chats=0;const {model,states}=setup(async body=>{if(body.action==='status')return {enabled:true,configured:true};chats++;return new Promise(r=>finish=r)},{autoVoice:false});
 await model.enter();const pending=model.ask('First question');await model.ask('Second question');
 assert.equal(chats,1);assert.match(states.at(-1),/上一条问题/);finish({answer:'Synthetic reply'});await pending;model.stop();
});
test('mobile renders full voice reply even if speech cannot play',async()=>{
 const {model,messages}=setup(async body=>{if(body.action==='status')return {enabled:true,configured:true};if(body.action==='chat')return {answer:'Synthetic long answer '.repeat(20),ticket:{data:JSON.stringify({text:'brief'})}};throw Error('Speech unavailable')},{autoVoice:false});
 await model.enter();await model.ask('Synthetic voice question',{voice:true});
 assert.match(messages.at(-1).text,/Synthetic long answer/);model.stop();
});
test('manual voice rejection explains the result instead of silently idling',async()=>{
 const {model,states}=setup(async body=>body.action==='status'?{enabled:true,configured:true}:{ignored:'unverified'},{autoVoice:false});
 await model.enter();await model.ask('Synthetic voice question',{voice:true});assert.match(states.at(-1),/未通过验证/);model.stop();
});

test('text answers while voice readiness is pending, without a late status overwriting the reply',async()=>{
 let voice,chats=0;const {model,states,messages}=setup(async body=>{if(body.action==='status')return {enabled:true,configured:true};chats++;return {answer:'Synthetic text while voice waits',provider:'internal',context:{route:'conversation'}}},{autoVoice:false,realtimeRequest:()=>new Promise(r=>voice=r)});
 const entering=model.enter();await new Promise(r=>setImmediate(r));await model.ask('Synthetic text question');assert.equal(chats,1);assert.match(messages.at(-1).text,/Synthetic text/);assert.equal(states.at(-1),'回答完成');voice({ready:true});await entering;assert.equal(states.at(-1),'回答完成');assert.equal(Recognition.instances.length,0);model.stop();
});

test('explicit call prepares audio in the click before a slow voice preflight, but never captures if it fails',async()=>{
 let prepared=0,released=0,captured=0,voice;const {model,host}=setup(async body=>{if(body.action==='status')return {enabled:true,configured:true};return new Blob(['synthetic'])},{autoVoice:false,phoneInputFactory:async()=>{prepared++;return {release:()=>released++}},phoneCapture:async()=>{captured++;throw Error('unexpected capture')},realtimeRequest:()=>new Promise(r=>voice=r)});
 const phone=host.children.flatMap(e=>e.children||[]).find(e=>e.dataset.voiceTool==='phone');const starting=phone.onclick();assert.equal(prepared,1);await new Promise(r=>setImmediate(r));assert.equal(captured,0);voice({ready:false,voiceprint_available:false});await starting;assert.equal(model.phone.isActive(),false);assert.equal(captured,0);assert.equal(released,1);model.stop();
});

test('material connection failure is retryable and keeps the last successful topic',async()=>{
 let fail=true;const histories=[];
 const {model,states,messages}=setup(async body=>{
  if(body.action==='status')return {enabled:true,configured:true};
  histories.push(body.materialHistory);
  if(body.question==='那留缝多少'&&fail){
   fail=false;
   throw Object.assign(Error('企业资料暂时连不上，可重试刚才的问题'),{status:503});
  }
  return {answer:'Synthetic material answer',provider:'internal',context:{route:'materials',material_question:'物料：木门'}};
 },{autoVoice:false});
 try{
  await model.enter();await model.ask('木门怎么保养');await model.ask('那留缝多少');
  assert.equal(states.at(-1),'回答未完成，可重试');
  assert.match(messages.at(-1).text,/企业资料暂时连不上/);
  await model.ask('那留缝多少');
  assert.deepEqual(histories,[[],['物料：木门'],['物料：木门']]);
  assert.equal(states.at(-1),'回答完成');
 }finally{model.stop()}
});

test('Grace draft recovery supplies only signed context to chat, never private answer history',async()=>{
 const calls=[];const {model,messages}=setup(async body=>{calls.push(body);if(body.action==='status')return {enabled:true,configured:true};if(body.action==='writing-session')return {draft:{answer:'PRIVATE-SAVED-ENGLISH-DRAFT',context:{material_question:'work-writing:v1.signed-state'}}};return {answer:'Synthetic edited draft',provider:'internal',context:{route:'work_writing',material_question:'work-writing:v1.next-state'}}},{autoVoice:false,restoreWritingDrafts:true});
 try{await model.enter();assert.equal(messages.at(-1).text,'PRIVATE-SAVED-ENGLISH-DRAFT');await model.ask('这版改得口语一点');const chat=calls.find(c=>c.action==='chat');assert.deepEqual(chat.materialHistory,['work-writing:v1.signed-state']);assert.deepEqual(chat.history,[]);assert.ok(!JSON.stringify(chat).includes('PRIVATE-SAVED'));}finally{model.stop()}
});

test('a material turn exits waiting if browser setup fails and can be retried',async()=>{
 let fail=true,chats=0;
 const {model,states}=setup(async body=>{
  if(body.action==='status')return {enabled:true,configured:true};
  chats++;
  return {answer:'示例说明\n来源：示例资料，第2页。',provider:'internal',context:{route:'materials'}};
 },{autoVoice:false,onTranscript(){if(fail){fail=false;throw Error('synthetic setup failure')}}});
 try{
  await model.enter();
  await model.ask('物料：示例功能');
  assert.equal(chats,0);
  assert.equal(model.busy(),false);
  assert.equal(states.at(-1),'回答未完成，可重试');
  await model.ask('物料：示例功能');
  assert.equal(chats,1);
  assert.equal(states.at(-1),'回答完成');
 }finally{model.stop()}
});

test('material transport timeout unblocks a browser turn even when the request never settles',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {model,states}=setup(body=>body.action==='chat'?new Promise(()=>{}):Promise.resolve({enabled:true,configured:true}),{autoVoice:false});
 try{
  await model.enter();
  const pending=model.ask('物料：示例功能');
  t.mock.timers.tick(70000);
  await pending;
  assert.equal(model.busy(),false);
  assert.equal(states.at(-1),'回答未完成，可重试');
 }finally{model.stop()}
});
