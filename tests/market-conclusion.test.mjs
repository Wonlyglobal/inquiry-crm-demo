import test from 'node:test';import assert from 'node:assert/strict';
import {marketDecision,negativeMarketFact,renderMarketDecision} from '../supabase/functions/agent-conversation/market-conclusion.mjs';
import {countryMatches,countryAssessment,validMarketEvidence,productMarketReport} from '../supabase/functions/agent-conversation/product-market.mjs';
const fact={field:'开锁方式',value:'Synthetic fingerprint',ref:'Synthetic V9 第2页'};
const assessment={country:{label:'合成国家'},usable:[{id:'synthetic-price',kind:'price'},{id:'synthetic-channel',kind:'channel'},{id:'synthetic-demand',kind:'demand'},{id:'synthetic-rule',kind:'admission'}]};
test('a rule plus a product fact cannot establish admission, installation or commercial readiness',()=>{
 const d=marketDecision({model:'TEST80 PRO',facts:[fact],conflicts:[]},assessment);assert.equal(d.stage,'document_validation');assert.match(d.conclusion,/安装与售后渠道/);assert.match(d.conclusion,/商业进入、试销和国家评级均暂缓/);assert.match(d.blockers.join('；'),/证书范围未核实/);assert.match(renderMarketDecision(d),/synthetic-rule/);assert.match(renderMarketDecision(d),/Synthetic V9 第2页/);
 assert.match(renderMarketDecision(d),/通过数\/总尝试/);assert.match(renderMarketDecision(d),/未执行/);
});
test('identity alone and stale supplemental parameters cannot authorize a sample or infer capability',()=>{
 const d=marketDecision({model:'TEST80 PRO',facts:[{field:'型号',value:'TEST80 PRO'}],supplemental:[fact],conflicts:[]},assessment);assert.equal(d.stage,'product_evidence_gap');assert.match(d.conclusion,/只支持资料核对/);assert.deepEqual(d.parameter_fields,[]);assert.doesNotMatch(renderMarketDecision(d),/支持远程开门/);
});
test('wireless or no-key wording is not a negative feature while explicit lack remains negative',()=>{
 for(const value of ['无线连接','无钥匙进入','wireless','fingerprint'])assert.equal(negativeMarketFact({value}),false);
 for(const value of ['不支持远程','未配备网关','not supported','without battery','无联网功能','无Wi-Fi模块','未取得认证','not certified','does not support remote unlock'])assert.equal(negativeMarketFact({value}),true);
});
test('each researched country selects only its own dated evidence and preserves concrete actions and gaps',()=>{
 const now=Date.parse('2026-10-26T06:00:00Z'),rows=validMarketEvidence();
 for(const code of ['VN','MY','ID','ZA','NG','KE']){
  const country=countryMatches(code)[0],a=countryAssessment({model:'TEST80 PRO',category:'smart_lock',facts:[fact],conflicts:[]},country,undefined,now);
  assert.ok(a.usable.length>=3,code);assert.ok(a.usable.every(e=>e.country===code));assert.match(a.competition,/存在可核对竞品供给/);assert.equal(a.score,null);assert.equal(a.competition_score,null);
  const report=productMarketReport({question:`TEST80 PRO智能锁V9在${code}市场分析`,catalog:{sources:[],products:[],pages:[],facts:[]},now,materials:{status:'unavailable',assets:[]}});
  assert.match(report.answer,/具体决策结论/);assert.match(report.answer,/本轮公开研究缺口/);assert.match(report.answer,/实际核验：2026-10-26/);assert.match(report.answer,/当前只支持资料核对/);
  assert.ok(rows.some(e=>e.country===code));
 }
});
