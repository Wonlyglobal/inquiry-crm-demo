import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {answerWorkScenario,workScenarioIntent} from '../supabase/functions/agent-conversation/work-scenarios.mjs';
import {writingPrimaryTask} from '../supabase/functions/agent-conversation/writing-request.mjs';
const c={sources:[{id:'c2',edition:'test'}],facts:[{topic:'founding',catalog:'c2',page:3,text:'Founded in 1996.'},{topic:'listing',catalog:'c2',page:3,text:'Listed in 2021, code 605268.'}]};
const sign=async t=>crypto.createHmac('sha256','test-only').update(t).digest('hex');const options={actor:'owner',sign,verify:async(t,s)=>s===await sign(t)};
const ask=(question,previous)=>answerWorkScenario({action:'chat',question,materialHistory:previous?[previous.context.material_question]:[]},c,options);
test('a later formatting constraint does not replace the task or turn customer copy into an internal review',async()=>{
 const q='帮我写约300词英文王力公司介绍，等我确认后再翻西语。\n给内部核对要点，客户正文另列。';
 assert.ok(workScenarioIntent({action:'chat',question:q}));const a=await ask(q);assert.ok(a.customer_text);assert.match(a.customer_text,/Founded in/);assert.equal(a.context.language,'en');
 const b=await ask('删掉研发部分，还没确认，暂时不要翻译。',a);const no=await ask('翻译成西语',b);assert.equal(no.context.status,'awaiting_confirmation');assert.doesNotMatch(no.answer,/Gracias/);const es=await ask('现在确认最新英文版本，翻译成西语',b);assert.equal(es.context.status,'translated');assert.match(es.customer_text,/Gracias/);
});
test('multiline task-specific answers do not collapse into generic discovery questions',async()=>{
 const a=await ask('沿海项目担心腐蚀，给资料核验路径。\n最后只问一个最关键的澄清问题。');assert.match(a.answer,/涂层|盐雾/);
 const b=await ask('客户说价格太贵，给三个可能原因和追问。\n只保留推动下一步最必要的内容。');assert.match(b.answer,/预算|价格|比较/);
});
test('explicit legacy audience background remains background and internal review remains internal',async()=>{
 assert.equal(writingPrimaryTask('面向西班牙经销商：先核对安装。\n帮我写英文王力公司介绍。\n保留出处。'),'帮我写英文王力公司介绍。');
 const a=await ask('面向西班牙经销商：先核对安装。\n帮我写英文王力公司介绍。\n保留出处。');assert.ok(a.customer_text);
 const b=await ask('仅内部核对王力公司介绍，不要写客户文案。\n请区分事实和建议。');assert.equal(b.customer_text,undefined);assert.match(b.answer,/可核事实/);
});
test('short client requests stay short and unknown logistics remain explicit placeholders',async()=>{
 const intro=await ask('把王力公司介绍改成不超过80字的中文电梯介绍，出处放正文外。\n请区分事实和未知项。');assert.ok(intro.customer_text);assert.ok((intro.customer_text.match(/[\u3400-\u9fff]/g)||[]).length<=80);assert.doesNotMatch(intro.customer_text,/来源|资料|核验/);assert.match(intro.internal_notes,/PDF第3页/);
 const message=await ask('展会认识客户后写中文WhatsApp跟进消息，不超过80字。');assert.ok(message.customer_text);assert.ok((message.customer_text.match(/[\u3400-\u9fff]/g)||[]).length<=80);assert.match(message.internal_notes,/未实际发送/);
 const sample=await ask('给客户写样品寄出通知模板，物流单号未知留占位，不编事实。');assert.match(sample.customer_text,/寄出状态［待确认］/);assert.match(sample.customer_text,/单号［待确认］/);assert.doesNotMatch(sample.customer_text,/已寄出|已发出|预计.*送达/);
 const english=await ask('展会后写英文WhatsApp跟进消息，客户正文不放内部备注。');assert.match(english.customer_text,/exhibition/);assert.doesNotMatch(english.customer_text,/[\u3400-\u9fff]/);assert.match(english.internal_notes,/未实际发送/);
});
