import test from 'node:test';
import assert from 'node:assert/strict';
import {mountConversation} from '../assets/agent-conversation.mjs';
class Element{children=[];value='';append(...nodes){this.children.push(...nodes);if(!this.value&&nodes[0]?.value)this.value=nodes[0].value}prepend(...nodes){this.children.unshift(...nodes)}setAttribute(){}}
class Recognition{static instances=[];static async available(){return 'available'}start(){Recognition.instances.push(this)}abort(){this.aborted=true}}
Recognition.prototype.processLocally=false;
function setup(invoke=async()=>({enabled:true,configured:true,model:'test'})){
 Recognition.instances=[];globalThis.document={hidden:false,createElement:()=>new Element(),addEventListener(){}};globalThis.window={SpeechRecognition:Recognition,addEventListener(){}};
 const host=new Element();let persona='Grace';const model=mountConversation(host,{invoke,getPersona:()=>persona,isAllowed:()=>true,onMode(){},onMessage(){},onTranscript(){},onSelectPersona(){}});
 return {model,host,setPersona:p=>persona=p};
}
test('opening Grace automatically starts local wake without sending speech or chat',async()=>{
 const calls=[];const {model}=setup(async body=>{calls.push(body.action);return {enabled:true,configured:true,model:'test'}});
 try{await model.enter();assert.equal(model.isModel(),true);assert.equal(Recognition.instances.length,1);assert.equal(Recognition.instances[0].processLocally,true);assert.deepEqual(calls,['status'])}finally{model.reset()}
});
test('leaving Grace before connection completes prevents late microphone activation',async()=>{
 let resolve;const {model}=setup(()=>new Promise(r=>resolve=r));const pending=model.enter();model.reset();resolve({enabled:true,configured:true});await pending;assert.equal(Recognition.instances.length,0);
});
test('other rooms and hidden pages do not auto-start Grace wake',async()=>{
 const {model,setPersona}=setup();setPersona('Brian');await model.enter();setPersona('Grace');document.hidden=true;await model.enter();assert.equal(Recognition.instances.length,0);model.reset();
});
