import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {answerWorkScenario} from '../supabase/functions/agent-conversation/work-scenarios.mjs';
const c={sources:[{id:'c2',edition:'synthetic-2026'}],facts:[{topic:'bases',catalog:'c2',page:3,text:'Yongkang, Wuyi, Sichuan, Hangzhou, Hubei'},{topic:'founding',catalog:'c2',page:3,text:'Founded in 1996.'},{topic:'listing',catalog:'c2',page:3,text:'Listed in 2021, code 605268.'},{topic:'rnd',catalog:'c2',page:3,text:'Synthetic research',zh:'研发投入超过8000万元，团队400人'},{topic:'capacity',catalog:'c2',page:3,text:'Synthetic capacity'}]};
const sign=async t=>crypto.createHmac('sha256','offline-test-signing-key').update(t).digest('hex');
const options={actor:'fixture-owner',sign,verify:async(t,s)=>s===await sign(t)};
const ask=(question,prev,opts=options,cat=c)=>answerWorkScenario({action:'chat',persona:'Grace',question,history:[],materialHistory:prev?[prev.context.material_question]:[]},cat,opts);
const initial='帮我写约300词王力公司介绍，先英文给我确认，等我确认后翻译成西班牙语。';
test('English first; edits remain English; only latest approved revision is translated',async()=>{
 const a=await ask(initial);assert.equal(a.context.language,'en');assert.equal(a.context.approved,false);assert.match(a.answer,/Manufacturing capacity|manufacturing network|production bases/i);
 const early=await ask('请把这版翻译成西语',a);assert.equal(early.context.status,'awaiting_confirmation');assert.doesNotMatch(early.answer,/Gracias|Fundada/);
 const b=await ask('删掉产能部分，强调研发和合作沟通；还没确认。',a);assert.equal(b.context.language,'en');assert.equal(b.context.approved,false);assert.doesNotMatch(b.answer,/Manufacturing capacity|manufacturing network|production bases/i);assert.match(b.answer,/Research and development/);
 const t=await ask('现在确认最新英文版本，翻译成西语。',b);assert.equal(t.context.status,'translated');assert.equal(t.context.revision,b.context.revision);assert.doesNotMatch(t.answer,/capacidad de fabricación|bases de producción|red de fabricación/i);assert.match(t.answer,/investigación/);
 const edit=await ask('这版再改得口语一点，暂时不要翻译',t);assert.equal(edit.context.language,'en');assert.equal(edit.context.approved,false);
});
test('negated, conditional and question-shaped confirmation never approve',async()=>{const a=await ask(initial);for(const q of ['这版英文还没确认，翻译成西班牙语','这版如果确认了再翻译成西语','这版确认了吗？请翻译成西语','这版暂时不要翻译成西班牙语']){const r=await ask(q,a);assert.equal(r.context.status,'awaiting_confirmation',q);assert.doesNotMatch(r.answer,/Gracias|Fundada/,q)}});
test('tampered state, other actor and changed source fail closed',async()=>{const a=await ask(initial);const fake=structuredClone(a);fake.context.material_question=fake.context.material_question.replace(/.$/,'x');assert.equal((await ask('现在确认最新英文稿，翻译成西语',fake)).context.status,'invalid_state');assert.equal((await ask('现在确认最新英文稿，翻译成西语',a,{...options,actor:'another-owner'})).context.status,'invalid_state');const other=structuredClone(c);other.facts[0].text+=' changed';assert.equal((await ask('现在确认最新英文稿，翻译成西语',a,options,other)).context.status,'source_changed')});
test('independent new task resets state; foreign input is not treated as confirmed company draft',async()=>{const a=await ask(initial);const b=await ask('客户说价格太贵，给三个可能原因以及下一步问什么',a);assert.equal(b.context.language,'zh');assert.doesNotMatch(b.answer,/Thank you/);const provided=await ask('我会提供一段已确认英文稿，请只翻成西班牙语，目前先告诉我需要提供什么');assert.match(provided.answer,/提供.*完整英文/);assert.doesNotMatch(provided.answer,/Gracias/)});

test('bare translation request cannot skip approval',async()=>{const a=await ask(initial);const b=await ask('翻译成西班牙语',a);assert.equal(b.context.status,'awaiting_confirmation');assert.doesNotMatch(b.answer,/Gracias/)});

test('the approved draft hash must match the rendered English, including after a renderer change',async()=>{
 const a=await ask(initial);const prefix='work-writing:v1.';const [payload]=a.context.material_question.slice(prefix.length).split('.');const state=JSON.parse(Buffer.from(payload,'base64url').toString());state.h='0'.repeat(64);const changed=Buffer.from(JSON.stringify(state)).toString('base64url');const signed=prefix+changed+'.'+await sign('work-writing-v1|'+options.actor+'|'+changed);const fake={context:{material_question:signed}};assert.equal((await ask('现在确认最新英文稿，翻译成西语',fake)).context.status,'draft_changed');
});

test('short care follow-up removes framing while preserving every source condition and reference',async()=>{
 const text='资料中的相关说明如下：\n\n请先核对涂层与厂家清洁说明，不能使用未经确认的清洁剂。\n来源：合成木门说明，第 2 页，2026版\n\n以上为本次找到的原页摘录。需要我打开对应资料给你核对吗？';
 const opts={...options,careAnswer:async()=>text};const a=await ask('客户问木门怎么保养，写成简洁说明',null,opts);const b=await ask('在不改变已核对事实的前提下，再精简一版，并保留出处。',a,opts);assert.ok(b.answer.length<a.answer.length);assert.match(b.answer,/请先核对涂层与厂家清洁说明，不能使用未经确认的清洁剂。/);assert.match(b.answer,/来源：合成木门说明，第 2 页，2026版/);assert.doesNotMatch(b.answer,/以上为本次找到/);
});

test('identical new drafts have independent confirmation identities',async()=>{const a=await ask(initial),b=await ask(initial);assert.equal(a.answer,b.answer);assert.notEqual(a.context.material_question,b.context.material_question)});
