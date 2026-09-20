import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {canAccessInquiry} from '../supabase/functions/_shared/inquiry-access.ts';
import {customerDataAiFetch,assertCustomerDataAiPolicy} from '../supabase/functions/_shared/customer-data-ai.ts';
async function run(name,team) {
 const queries=[];let handler;let externalCalls=0;
 const profile={id:'actor',role:'sales_manager',active:true,team:'a'};
 const db={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from(table){
  const q={table,fields:'',filters:{}};queries.push(q);
  const result=()=>{
   let data=table==='profiles'?(q.filters.id==='actor'?profile:{team}):table==='inquiries'?{id:'inquiry',owner_id:'other',company_id:null}:table==='email_messages'?{id:'message',inquiry_id:'inquiry',direction:'inbound',subject:'synthetic',body_text:'synthetic'}:null;
   return {data,error:null};
  };
  const chain={select(v){q.fields=v;return chain},eq(k,v){q.filters[k]=v;return chain},single:async()=>result(),maybeSingle:async()=>result()};
  return chain;
 }};
 const source=stripTypeScriptTypes((await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8')).replace(/^import .*;\n/gm,''));
 const env={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',DEEPSEEK_API_KEY:'synthetic-ai'};
 const evaluate=new Function('Deno','createClient','withReadOnlyGuard','canAccessInquiry','customerDataAiFetch','assertCustomerDataAiPolicy','fetch',source);
 evaluate({env:{get:k=>env[k]},serve:f=>{handler=f}},()=>db,f=>f,canAccessInquiry,customerDataAiFetch,assertCustomerDataAiPolicy,async()=>{externalCalls++;throw Error('unexpected external request')});
 const payload=name==='mailbox-ai-draft'?{action:'reply',message_id:'message'}:{inquiry_id:'inquiry',subject:'synthetic',body:'synthetic'};
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-user'},body:JSON.stringify(payload)}));
 return {response,queries,externalCalls};
}
for(const name of ['mailbox-ai-draft','mailbox-draft-fact-check']) {
 test(`${name}: cross-team request stops before customer content and provider`,async()=>{
  const {response,queries,externalCalls}=await run(name,'b');
  assert.equal(response.status,403);assert.equal(externalCalls,0);
  assert.equal(queries.some(q=>q.fields.includes('body_text')||q.fields.includes('demand_summary')||q.table==='quotation_versions'),false);
 });
}
test('fact check policy blocks even an authorized caller before cache/source collection',async()=>{
 const {response,queries,externalCalls}=await run('mailbox-draft-fact-check','a');
 assert.match((await response.json()).error,/AI_DATA_POLICY_BLOCKED/);
 assert.equal(externalCalls,0);
 assert.equal(queries.some(q=>['email_messages','ai_suggestions','quotation_versions'].includes(q.table)),false);
});

test('reply policy blocks authorized customer context before collecting body text',async()=>{
 const {response,queries,externalCalls}=await run('mailbox-ai-draft','a');
 assert.match((await response.json()).error,/AI_DATA_POLICY_BLOCKED/);
 assert.equal(externalCalls,0);
 assert.equal(queries.some(q=>q.fields.includes('body_text')),false);
});
