import test from 'node:test';import assert from 'node:assert/strict';
import {companyQuestion,companyDirectAnswer,companyDocuments} from '../supabase/functions/agent-conversation/company-question.mjs';
import {privateIntelligenceIntent,privateIntelligenceQuery,readPrivateIntelligence} from '../supabase/functions/agent-conversation/private-intelligence.mjs';
const row={id:'test-id',digest:'a'.repeat(64),document:{kind:'evidence',key:'evidence-2026-01-01',generated_at:'2026-01-01',sections:[{title:'企业文化公司知识 1/1',body:'来源：synthetic.xlsx SHA256 test\n【测试 A1】企业使命\n原题：企业使命是【】\n原表答案：测试使命\n【测试 A2】核心价值观\n原题：核心价值观是【】\n原表答案：测试价值观'}],evidence:[]}};
test('direct own-company natural questions route to bounded original RPC without selecting a report',async()=>{for(const q of ['王力的使命是什么？','公司的英文名是什么？','查看今天已同步的企业文化信息','核心价值观呢？'])assert.equal(privateIntelligenceIntent(q),true,q);for(const q of ['腾讯的使命是什么','背调客户的经营范围','霍曼公司英文名是什么'])assert.equal(companyQuestion(q),false);assert.equal(privateIntelligenceQuery('王力使命是什么').p_limit,5);let calls=0;const result=await readPrivateIntelligence({rpc:async(name,args)=>{calls++;assert.equal(name,'read_agent_private_intelligence');assert.equal(args.p_kind,'evidence');return {data:{documents:[row]}}}},'王力的使命是什么');assert.equal(calls,1);assert.match(result.answer,/测试使命/);assert.doesNotMatch(result.answer,/测试价值观/);assert.equal(result.receipts.length,1)});
test('company field answers preserve original evidence, gaps and no fabricated missing fields',()=>{const a=companyDirectAnswer([row],'王力核心价值观是什么');assert.match(a,/测试价值观/);assert.match(a,/A2/);assert.match(a,/来源：synthetic\.xlsx/);assert.doesNotMatch(a,/a{64}|SHA256|资料生成日期|版本校验/);assert.doesNotMatch(a,/测试使命/);assert.match(companyDirectAnswer([row],'王力哪年成立'),/保持未知/);assert.equal(companyDocuments([{...row,document:{...row.document,kind:'daily'}}]).length,0);assert.match(companyDirectAnswer([],'王力使命'),/未命中不表示/)});

test('ordinary full-name aliases and combined company fields remain private and concise',()=>{
 for(const q of ['王力的公司英文全称是什么？','公司英文全称呢','使命和愿景分别是什么？','请告诉我企业使命和核心价值观'])assert.equal(companyQuestion(q),true,q);
 for(const q of ['微软的使命和愿景分别是什么','客户公司英文全称是什么','S60 Max的尺寸是多少','核心价值观以及订单'])assert.equal(companyQuestion(q),false,q);
 const a=companyDirectAnswer([row],'使命和核心价值观分别是什么');assert.match(a,/测试使命/);assert.match(a,/测试价值观/);assert.ok(a.length<350);
});

test('source-only company followup returns references rather than entire culture report',async()=>{
 const sourceRow={...row,document:{...row.document,period:{to:'2026-01-01'},evidence:[{title:'Synthetic table',url:'internal://synthetic',gap:'Synthetic review pending'}]}};
 const result=await readPrivateIntelligence({rpc:async()=>({data:{documents:[sourceRow]}})},'查看私有知识 evidence-2026-01-01，来源呢');
 assert.match(result.answer,/Synthetic table/);assert.match(result.answer,/internal:\/\/synthetic/);assert.match(result.answer,/review pending/);assert.doesNotMatch(result.answer,/测试使命|测试价值观/);
});

test('company source followup locates section provenance even without evidence entries',async()=>{
 const result=await readPrivateIntelligence({rpc:async()=>({data:{documents:[row]}})},'查看私有知识 evidence-2026-01-01，来源呢');
 assert.match(result.answer,/synthetic\.xlsx/);assert.doesNotMatch(result.answer,/测试使命|测试价值观|来源：。/);
});
