import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeProductTurn,loadPrivateProductEvidence,nativeProductAnswer} from '../supabase/functions/agent-conversation/private-product-knowledge.mjs';
import {privateIntelligenceAnswer,privateIntelligenceQuery} from '../supabase/functions/agent-conversation/private-intelligence.mjs';
import {validPrivateReceipt,privateReceiptLabel} from '../assets/agent-private-intelligence.mjs';
import {productDocument} from './private-product-evidence-fixture.mjs';
import {productMarketReport} from '../supabase/functions/agent-conversation/product-market.mjs';
import {PRIVATE_REPORT_KEY,privateReportQuestion} from '../assets/agent-private-report-context.mjs';
const id='11111111-1111-4111-8111-111111111111',digest='b'.repeat(64);
const row=()=>({id,digest,imported_at:'2026-10-26T01:00:00Z',document:productDocument()});
test('native parameter followups retain full model and explicit edition but not an unrelated request',()=>{
 const turn=nativeProductTurn('介绍TEST80 Pro V9的参数');assert.equal(turn.model,'TEST80 PRO');
 const next=nativeProductTurn('那它的电池呢',['私有产品：'+turn.question]);assert.equal(next.model,'TEST80 PRO');assert.equal(next.edition.toLowerCase(),'v9');
 assert.equal(nativeProductTurn('那天气怎么样',['私有产品：'+turn.question]),null);
 const switched=nativeProductTurn('换成TEST81 Pro',['私有产品：'+turn.question]);assert.equal(switched.model,'TEST81 PRO');assert.equal(switched.edition,'V9');
 assert.equal(nativeProductTurn('比较TEST80和TEST80 Pro的参数'),null);
});
test('private product reads use bounded owner RPC and same source rather than packet authority',async()=>{
 const calls=[],client={rpc:async(name,args)=>{calls.push([name,args]);return {data:{documents:[row()]}}}};
 const result=await loadPrivateProductEvidence(client,{model:'TEST80 Pro',edition:'V9',materials:{assets:[{id:'asset',versionLabel:'V9',isCurrentVersion:true,document:{sha256:'a'.repeat(64),pages:[{page:1}]}}]}});
 assert.equal(calls[0][0],'read_agent_private_intelligence');assert.equal(calls[0][1].p_kind,'product');assert.equal(calls[0][1].p_limit,5);
 assert.equal(result.receipts[0].id,id);assert.equal(result.facts.length,1);assert.equal(result.facts[0].analysis_eligible,true);
 const missing=await loadPrivateProductEvidence(client,{model:'TEST80 Basic',materials:{assets:[]}});assert.equal(missing.status,'not_found');
 const chineseEdition=await loadPrivateProductEvidence(client,{model:'TEST80 Pro',edition:'第九版',materials:{assets:[]}});assert.equal(chineseEdition.receipts.length,1);
 const unmatched=await loadPrivateProductEvidence(client,{model:'TEST80 Pro',materials:{assets:[]}});assert.equal(unmatched.facts[0].analysis_eligible,false);
 const failed=await loadPrivateProductEvidence({rpc:async()=>({error:{message:'not exposed'}})},{model:'TEST80 Pro'});assert.equal(failed.status,'unavailable');assert.equal(failed.facts.length,0);
});
test('a rejected second private configuration withholds analysis of all native candidates',async()=>{
 const good=row(),bad=structuredClone(good);bad.id='22222222-2222-4222-8222-222222222222';
 const r=bad.document.product_evidence.regions[0];r.field.bbox=[300,10,450,30];
 const client={rpc:async()=>({data:{documents:[good,bad]}})},materials={status:'available',assets:[{id:'source',versionLabel:'V9',isCurrentVersion:true,document:{sha256:'a'.repeat(64),pages:[{page:1}]}}]};
 const result=await loadPrivateProductEvidence(client,{model:'TEST80 PRO',edition:'V9',materials});assert.equal(result.facts.length,1);assert.equal(result.blocked.length,1);assert.equal(result.facts[0].analysis_eligible,false);
});
test('saved product receipt/list reads remain compatible without claiming source verification',()=>{
 const r=row(),receipt={id,digest,key:r.document.key};assert.equal(validPrivateReceipt(receipt),true);assert.match(privateReceiptLabel(receipt.key),/产品原生页/);
 assert.equal(validPrivateReceipt({...receipt,key:'product-'+('a'.repeat(63))}),false);
 assert.equal(PRIVATE_REPORT_KEY.test(receipt.key),true);assert.equal(privateReportQuestion('来源有哪些',receipt.key),'查看私有知识 '+receipt.key+'，来源有哪些');assert.equal(privateReportQuestion('换成TEST81 Pro',receipt.key),'换成TEST81 Pro');
 const query=privateIntelligenceQuery('查看私有知识 '+receipt.key);assert.equal(query.p_key,receipt.key);assert.equal(query.p_kind,'product');
 const answer=privateIntelligenceAnswer({documents:[r]},'查看私有知识 '+receipt.key);assert.match(answer,/Synthetic supply 8V/);assert.match(answer,/未完成同源现行验证/);assert.match(answer,/知识包SHA-256/);assert.match(answer,/原文发布日期：未知/);
});
test('parameter response uses original quotes, no commercial score and a query-only context',()=>{
 const turn={model:'TEST80 Pro',edition:'V9',question:'TEST80 Pro V9参数'};
 const answer=nativeProductAnswer({facts:[],receipts:[],gaps:[],status:'not_found'},turn);
 assert.match(answer.answer,/不借用相邻型号/);assert.match(answer.answer,/不据此给出国家商业匹配评分/);assert.equal(answer.material_question,'私有产品：'+turn.question);
 assert.match(nativeProductAnswer({facts:[],gaps:[]},{...turn,question:'TEST80 Pro 的防水等级是多少'}).answer,/具体参数未在这些原生文字中返回/);
});
test('only source-validated private facts supplement a market report and never establish commercial admission',async()=>{
 const client={rpc:async()=>({data:{documents:[row()]}})},materials={status:'available',assets:[{id:'source',name:'Synthetic source',versionLabel:'V9',isCurrentVersion:true,document:{sha256:'a'.repeat(64),pages:[{page:1,chunks:[],facts:[]}]}}],source_lookups:[{completeness:'complete'}]};
 const native=await loadPrivateProductEvidence(client,{model:'TEST80 PRO',edition:'V9',materials});
 const catalog={sources:[],products:[{model:'TEST80 PRO',category:'smart_lock'}]};
 const report=productMarketReport({question:'TEST80 PRO智能锁V9在肯尼亚的市场分析',catalog,materials,native,evidence:[],now:Date.parse('2026-10-26')});
 assert.equal(report.current_parameter_count,1);assert.match(report.answer,/Synthetic supply 8V/);assert.match(report.answer,/试销和国家评级均暂缓/);
 assert.equal(report.assessments[0].score,null);
 const unmatched=await loadPrivateProductEvidence(client,{model:'TEST80 PRO',edition:'V9',materials:{assets:[]}});
 const blocked=productMarketReport({question:'TEST80 PRO智能锁V9在肯尼亚的市场分析',catalog,materials,native:unmatched,evidence:[]});assert.equal(blocked.current_parameter_count,0);
});
