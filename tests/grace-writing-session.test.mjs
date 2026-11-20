import test from 'node:test';import assert from 'node:assert/strict';
import {latestWriting,restoredWriting,saveWriting} from '../supabase/functions/agent-conversation/writing-session.mjs';
import {answerWorkScenario,writingContinuation,newWritingDraft} from '../supabase/functions/agent-conversation/work-scenarios.mjs';
import crypto from 'node:crypto';
const catalog={sources:[{id:'c2',edition:'test-v1'}],facts:[{topic:'founding',catalog:'c2',page:3,text:'Founded in 1996.'},{topic:'listing',catalog:'c2',page:3,text:'Listed in 2021, stock 605268.'},{topic:'rnd',catalog:'c2',page:3,text:'Test R&D',zh:'研发投入超过8000万元，团队400人'},{topic:'capacity',catalog:'c2',page:3,text:'Test capacity'}]};
const options={actor:'owner',sign:async s=>crypto.createHmac('sha256','test-only').update(s).digest('hex')};options.verify=async(s,v)=>v===await options.sign(s);
const draftInput={action:'chat',persona:'Grace',question:'帮我写300词英文公司介绍，等我确认后翻译成西语',history:[]};
test('persisted signed draft resumes after a fresh controller and invalidates approval on edit',async()=>{
 let stored=null;const db={from(name){assert.equal(name,'grace_chat_turns');const q={select:()=>q,eq:(k,v)=>{if(k==='actor')assert.equal(v,'owner');if(k==='memory_note')assert.equal(v,'grace-company-draft-v1');return q},order:()=>q,limit:async n=>{assert.equal(n,1);return {data:stored?[stored]:[]}}};return q},rpc:async(name,p)=>{assert.equal(name,'save_grace_writing_turn');if(p.p_expected!==(stored?.turn_id||null))return {data:false};stored={thread_id:p.p_thread,turn_id:crypto.randomUUID(),answer:p.p_answer,material_context:p.p_material};return {data:true}}};
 const a=await answerWorkScenario(draftInput,catalog,options);assert.equal(await saveWriting(db,'owner',null,draftInput,a,true),true);
 let reopened=restoredWriting(await latestWriting(db,'owner'));assert.match(reopened.answer,/Founded in/);
 const edit={...draftInput,question:'删掉产能，强调研发；还没确认',materialHistory:[reopened.context.material_question]};const b=await answerWorkScenario(edit,catalog,options);const prev=await latestWriting(db,'owner');assert.equal(await saveWriting(db,'owner',prev,edit,b,false),true);
 assert.equal(await saveWriting(db,'owner',prev,edit,b,false),false,'stale tab cannot append');
 reopened=restoredWriting(await latestWriting(db,'owner'));assert.doesNotMatch(reopened.answer,/Manufacturing capacity/);
 const r=await answerWorkScenario({...draftInput,question:'现在确认最新英文版本，翻译成西语',materialHistory:[reopened.context.material_question]},catalog,options);assert.match(r.answer,/Gracias/);assert.doesNotMatch(r.answer,/capacidad de fabricación/i);
 assert.equal(b.context.approved,false);assert.equal(r.context.revision,b.context.revision);
});
test('new draft intent is separate from confirm/edit continuation',()=>{assert.equal(writingContinuation({...draftInput,question:'确认最新英文稿并翻译成西语'}),true);assert.equal(writingContinuation(draftInput),false);assert.equal(newWritingDraft(draftInput.question),true)});
test('storage errors do not produce a restored or successfully saved draft',async()=>{await assert.rejects(latestWriting({from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({error:{}})};return q}},'owner'));await assert.rejects(saveWriting({rpc:async()=>({error:{}})},'owner',null,draftInput,{answer:'test',context:{material_question:'test'}},true));assert.equal(restoredWriting(null),null)});
