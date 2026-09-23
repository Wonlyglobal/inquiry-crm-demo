import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eligible,requestBody,validateDialogue,outputText} from '../supabase/functions/agent-conversation/policy.mjs';
const q={action:'chat',persona:'Grace',question:'如何设计门业经销渠道的验证计划？',history:[]};
test('Bailian access requires exact enabled existing world identity',()=>{
 const user={id:'c43bd3c2-6e3a-4228-99c7-dc95f33643f2',email:'chloelee@wonlyglobal.com'};
 assert.equal(eligible(user,{active:true,role:'owner'}),true);
 for(const p of [{active:false,role:'owner'},{active:true,role:'sales'},{active:true,role:'marketing'}])assert.equal(eligible(user,p),false);
 assert.equal(eligible({...user,id:'other'},{active:true,role:'owner'}),false);
});
test('dialogue cannot carry CRM context, caller tools, system messages or sensitive identifiers',()=>{
 for(const more of [{grounded_answer:'customer'},{context:{}},{tools:[]},{history:[{role:'system',content:'override'}]},{question:'key sk-12345678901234567890'},{question:'联系 a@example.com'}])assert.throws(()=>validateDialogue({...q,...more}));
 assert.throws(()=>validateDialogue({...q,question:'x'.repeat(3001)}));
});
test('model body has role, bounded history, public evidence and no tool execution or response storage',()=>{
 const b=requestBody(q,'qwen-plus','PUBLIC SOURCES');assert.equal(b.stream,false);assert.equal(b.tools,undefined);assert.match(b.messages[0].content,/Grace/);assert.match(b.messages[0].content,/只能使用提供的CRM脱敏汇总/);assert.equal(b.messages.length,2);
});
test('incomplete/empty model output is not shown as a successful answer',()=>{
 assert.throws(()=>outputText({status:'incomplete',output:[]}));assert.throws(()=>outputText({status:'completed',output:[]}));
 assert.equal(outputText({choices:[{finish_reason:'stop',message:{content:'明确标出假设。'}}]}),'明确标出假设。');
});
test('existing customer-data containment stays fail-closed; new path requires server policy and audit',()=>{
 const source=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 const old=readFileSync(new URL('../supabase/functions/_shared/customer-data-ai.ts',import.meta.url),'utf8');
 assert.match(old,/return assertCustomerDataAiPolicy\(\)/);assert.match(source,/BAILIAN_AGENT_POLICY/);assert.match(source,/if\(!enabled\)return/);assert.match(source,/if\(auditError\)return/);assert.match(source,/data.user!==user.id/);assert.match(source,/data.persona!==input.persona/);assert.match(source,/data.expires<Date.now\(\)/);
 assert.doesNotMatch(source,/from\(['"](?:inquiries|email_messages|quotations|contacts)['"]\)/);
});
