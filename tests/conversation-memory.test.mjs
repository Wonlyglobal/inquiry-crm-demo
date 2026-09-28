import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {embedBody,embeddingOf,embed,summarize,shouldStore,recallMemories,storeMemory,recallInstruction,conversationMemoryCommand,runConversationMemoryCommand,vectorLiteral,DIM} from '../supabase/functions/agent-conversation/conversation-memory.mjs';
import {EMBED_URL,providerJson} from '../supabase/functions/agent-conversation/bailian.mjs';
import {validateDialogue} from '../supabase/functions/agent-conversation/policy.mjs';
import {fitHistory} from '../assets/agent-conversation.mjs';
const vec=Array.from({length:DIM},(_,i)=>Math.sin(i));
test('embeddings go only to the fixed Bailian endpoint with 1024 dimensions',async()=>{
 assert.deepEqual(embedBody('x'.repeat(5000)).input.length,2000);assert.equal(embedBody('a').dimensions,1024);
 let seen;const e=await embed('沙特市场',{},async(url,body)=>{seen={url,body};return {data:[{embedding:vec}]}});assert.equal(seen.url,EMBED_URL);assert.equal(e.length,DIM);
 assert.equal(await embed('x','k',async()=>{throw Error('down')}),null);assert.equal(embeddingOf({data:[{embedding:[1,2]}]}),null);
 await assert.rejects(providerJson('https://evil.example/v1',{}, 'k',async()=>new Response('{}')),/不允许/);
 assert.match(vectorLiteral([0.1,-2]),/^\[0\.100000,-2\.000000\]$/);
});
test('what is stored: model answers only, summarised, never secrets or "不要记" turns or guests',()=>{
 assert.equal(shouldStore({question:'墨西哥市场怎么起步',answer:'先做……'}),true);
 assert.equal(shouldStore({question:'这个不要记，沙特报价底线多少',answer:'…'}),false);
 assert.equal(shouldStore({question:'墨西哥市场怎么起步',answer:'联系 a@b.com'}),false);
 assert.equal(shouldStore({question:'墨西哥市场怎么起步',answer:'x',guest:true}),false);assert.equal(shouldStore({question:'好',answer:'x'}),false);
 const long='第一句结论。'+'很长的分析。'.repeat(200);const s=summarize(long);assert.ok(s.length<=601);assert.match(s,/^第一句结论。/);assert.ok(!summarize('见 https://a.com 这里').includes('http'));
});
test('recall merges semantic matches above the threshold with the latest turns, deduplicated',async()=>{
 const admin={rpc:async(n,a)=>{assert.equal(n,'match_agent_memories');assert.match(a.p_embedding,/^\[/);return {data:[{id:1,persona:'Grace',question:'墨西哥认证',answer_summary:'需要NOM',created_at:'2025-03-01T00:00:00Z',similarity:0.8},{id:2,persona:'Grace',question:'无关',answer_summary:'x',created_at:'2025-01-01',similarity:0.3}]}},
  from:()=>({select:()=>({eq:()=>({order:()=>({limit:async()=>({data:[{id:1,persona:'Grace',question:'墨西哥认证',answer_summary:'需要NOM',created_at:'2025-03-01'},{id:9,persona:'Grace',question:'上周聊的SEO',answer_summary:'y',created_at:'2026-09-27'}]})})})})})};
 const rows=await recallMemories({admin,embedding:vec,persona:'Grace'});assert.deepEqual(rows.map(r=>r.id),[1,9]);
 const text=recallInstruction(rows);assert.match(text,/2025-03-01/);assert.match(text,/不能代替本轮提供的实时数据/);assert.match(text,/不编造/);assert.match(text,/"recent":true/);
 assert.deepEqual(await recallMemories({admin,embedding:null,persona:'Grace'}),[]);assert.equal(recallInstruction([]),'');
});
test('store writes question, summary and vector for the owner',async()=>{
 let row;const admin={from:t=>({insert:r=>{row={t,...r};return {select:()=>({single:async()=>({data:{id:42},error:null})})}}})};
 assert.equal(await storeMemory({admin,embedding:vec,persona:'Jay',question:' 要不要设海外仓 ',answer:'建议先不设。',user:'u'}),42);
 assert.equal(row.t,'agent_conversation_memory');assert.equal(row.question,'要不要设海外仓');assert.equal(row.answer_summary,'建议先不设。');assert.equal(row.created_by,'u');
});
test('memory commands: list, forget last/topic/all',async()=>{
 assert.deepEqual(conversationMemoryCommand('查看对话记忆'),{kind:'list'});assert.deepEqual(conversationMemoryCommand('你记得我们聊过什么？'),{kind:'list'});
 assert.deepEqual(conversationMemoryCommand('忘记刚才的对话'),{kind:'forget',scope:'last'});assert.deepEqual(conversationMemoryCommand('刚才这条不要记'),{kind:'forget',scope:'last'});
 assert.deepEqual(conversationMemoryCommand('忘记关于沙特报价的对话'),{kind:'forget',scope:'match',text:'沙特报价'});assert.deepEqual(conversationMemoryCommand('清空对话记忆'),{kind:'forget',scope:'all'});
 assert.equal(conversationMemoryCommand('我们上次聊的墨西哥认证结论是什么'),null);assert.equal(conversationMemoryCommand('查看记忆'),null);
 const client={rpc:async n=>n==='list_agent_conversation_memory'?{data:{total:12,first_at:'2026-09-28',by_persona:{Grace:10,Jay:2},recent:[{day:'2026-09-28',persona:'Grace',question:'墨西哥'}]}}:{data:3}};
 assert.match(await runConversationMemoryCommand({kind:'list'},{client}),/12 条.*没有时间限制/s);assert.match(await runConversationMemoryCommand({kind:'forget',scope:'all'},{client}),/全部 3 条/);
});
test('longer in-session history: 20 messages within 40,000 characters, trimmed client side',()=>{
 const h=Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(100)}));
 assert.doesNotThrow(()=>validateDialogue({action:'chat',persona:'Grace',question:'继续',history:h}));
 assert.throws(()=>validateDialogue({action:'chat',persona:'Grace',question:'继续',history:[...h,...h]}),/过长/);
 const big=Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:'y'.repeat(5000)}));const f=fitHistory(big);
 assert.ok(f.length<=20&&f.reduce((n,m)=>n+m.content.length,0)<=38000);assert.equal(f[0].role,'user');assert.doesNotThrow(()=>validateDialogue({action:'chat',persona:'Grace',question:'继续',history:f}));
});
test('migration: owner-only management, service-role recall, no time-based deletion',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20260928170000_agent_conversation_memory.sql',import.meta.url),'utf8');
 assert.match(sql,/vector\(1024\)/);assert.match(sql,/hnsw/);assert.match(sql,/revoke all on function public.match_agent_memories[^;]*authenticated/);assert.match(sql,/agent_correction_actor\(\)/);assert.doesNotMatch(sql,/interval|cron|expires/i);
});
