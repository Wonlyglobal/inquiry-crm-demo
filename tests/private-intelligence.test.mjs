import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {privateIntelligenceIntent,privateIntelligenceQuery,privateIntelligenceAnswer,readPrivateIntelligence} from '../supabase/functions/agent-conversation/private-intelligence.mjs';
import {crmLiveAnswer} from '../assets/agent-crm-live.mjs';

test('private report questions resolve Shanghai previous week without sending an AI request',()=>{
 assert.equal(privateIntelligenceIntent('查看上周周报以及新增证据'),true);
 assert.equal(privateIntelligenceIntent('S922的安装说明'),false);
 assert.deepEqual(privateIntelligenceQuery('上周周报',Date.parse('2026-10-19T01:00:00Z')),{p_kind:'weekly',p_from:'2026-10-12',p_to:'2026-10-18',p_key:null,p_limit:1});
 assert.equal(privateIntelligenceQuery('查看2026-10-12到2026-10-18周报').p_to,'2026-10-18');
 assert.equal(privateIntelligenceQuery('新增证据').p_kind,'evidence');
});
test('readback retains source dates, evidence IDs, gaps and raw uncertainty as text',async()=>{
 const row={id:'id-1',digest:'sha-1',imported_at:'2026-10-19T01:00:00Z',document:{key:'weekly-2026-10-12-2026-10-18',title:'周报',generated_at:'2026-10-19T00:00:00Z',period:{from:'2026-10-12',to:'2026-10-18'},sections:[{title:'统计口径',body:'样本不足，风险可能重叠'}],evidence:[{id:'source-1',title:'来源',fact:'获取失败',url:'https://example.com/',observed_at:'2026-10-18T01:00:00Z',published_at:null,gap:'未知'}]}};
 const calls=[];const r=await readPrivateIntelligence({rpc:async(name,args)=>{calls.push([name,args]);return {data:{documents:[row]}}}},'上周周报',Date.parse('2026-10-19T01:00:00Z'));
 assert.equal(calls.length,1);assert.equal(calls[0][0],'read_agent_private_intelligence');
 assert.match(r.answer,/知识编号：id-1/);assert.match(r.answer,/来源日期：未知/);assert.match(r.answer,/获取失败/);assert.match(r.answer,/未经人工事实核验/);assert.match(r.answer,/风险可能重叠/);
 assert.equal(r.receipts[0].digest,'sha-1');
 assert.match(privateIntelligenceAnswer({documents:[]}),/没有查到/);
 await assert.rejects(readPrivateIntelligence({rpc:async()=>({error:{message:'SECRET'}})},'周报'),e=>!e.message.includes('SECRET'));
});
test('private report metrics cannot be silently replaced by current live CRM totals',()=>{
 for(const question of ['查看上周周报，列出新增询盘和风险','私有证据里的来源有哪些','内部简报的商机有多少']){
  assert.equal(crmLiveAnswer(question,{ready:true,compute:()=>{throw Error('must not compute current totals')}}),null);
 }
});
test('private path has transactional owner-only persistence, no external memory fallback or public bucket',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261019020000_agent_private_intelligence.sql',import.meta.url),'utf8');
 const index=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 const module=readFileSync(new URL('../supabase/functions/agent-conversation/private-intelligence.mjs',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on public.agent_private_intelligence_versions from public,anon,authenticated/);
 assert.match(sql,/auth\.jwt\(\)->>'email'/);assert.match(sql,/p\.active=true and p\.role='owner'/);assert.match(sql,/on conflict\(owner_id,document_key,digest\) do nothing/);
 assert.match(sql,/禁止旧包覆盖/);assert.match(sql,/agent_private_intelligence_synced/);assert.match(sql,/agent_private_intelligence_read/);
 assert.doesNotMatch(module,/fetch\(|embed\(|storeMemory|requestBody|storage\.from/);
 assert.ok(index.indexOf("input.action==='private-intelligence-import'")<index.indexOf("if(!enabled)"));
 assert.ok(index.indexOf("if(guest)return json({answer:'内部周报")>index.indexOf('await readVoiceProof'));
});
