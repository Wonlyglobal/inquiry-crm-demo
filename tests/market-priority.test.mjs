import test from 'node:test';import assert from 'node:assert/strict';
import {crmMarketPriorityIntent,crmMarketPriorityScope,withCrmMarketPriority} from '../supabase/functions/agent-conversation/market-priority.mjs';
import {productMarketReport,countryMatches} from '../supabase/functions/agent-conversation/product-market.mjs';
const question='分析TEST80 PRO智能锁在CRM重点国家的市场，给出SWOT';
const period={start:'2026-09-26T04:00:00Z',end:'2026-10-26T04:00:00Z'};
test('CRM priority uses only current disclosable country groups and never hidden or unknown buckets',()=>{
 const scope=crmMarketPriorityScope(question,{status:'available',period,countries:[{label:'MX',count:6},{label:'SA',count:8},{label:'SG',count:1},{label:'other_or_unknown',count:12}]});
 assert.deepEqual(scope.countries,['SA','MX']);assert.equal(scope.status,'available');assert.match(scope.question,/沙特阿拉伯 SA/);assert.doesNotMatch(scope.question,/新加坡/);assert.match(scope.note,/不代表市场需求/);assert.match(scope.note,/2026-09-26至2026-10-26/);
});
test('empty small-sample or failed aggregate cannot select the existing research sample countries',()=>{
 for(const crm of [{status:'available',period,countries:[]},{status:'insufficient_sample',period},{status:'unavailable'}]){
  const scope=crmMarketPriorityScope(question,crm);assert.deepEqual(scope.countries,[]);assert.equal(scope.question,question);assert.match(scope.note,/尚未确定/);assert.doesNotMatch(scope.question,/新加坡|英国|墨西哥/);
  const report=withCrmMarketPriority({answer:'合成产品证据',status:'product_evidence_gap'},scope);assert.match(report.answer,/尚未确定/);assert.equal(report.status,'product_evidence_gap');
 }
});
test('ordinary explicit country analysis does not invoke CRM priorities or alter country choice',()=>{
 const q='TEST80 PRO在新加坡市场分析';assert.equal(crmMarketPriorityIntent(q),false);assert.deepEqual(crmMarketPriorityScope(q,null),{question:q,status:'not_requested',countries:[],note:''});
 for(const q of ['按询盘主要国家分析智能锁市场','智能锁优先国家沿用CRM'])assert.equal(crmMarketPriorityIntent(q),true);
 assert.equal(crmMarketPriorityIntent('不要按CRM重点国家，只分析TEST80 PRO智能锁在越南市场'),false);
});
test('automatic scope does not reuse old hidden countries and retains the disclosed ranking directly by ISO',()=>{
 const q=question+'；本轮国家 沙特阿拉伯 SA、墨西哥 MX',empty=crmMarketPriorityScope(q,{status:'available',period,countries:[]});
 assert.doesNotMatch(empty.question,/沙特|墨西哥/);
 const report=(s)=>productMarketReport({question:s.question,catalog:null,countryScope:s.countries});
 assert.deepEqual(report(empty).countries,[]);
 const available=crmMarketPriorityScope(question,{status:'available',period,countries:[{label:'MX',count:6},{label:'SA',count:8}]});
 assert.deepEqual(report({...available,question:available.question+' TEST80 PRO智能锁V9'}).countries,['SA','MX']);
 const id=crmMarketPriorityScope(question,{status:'available',period,countries:[{label:'ID',count:5}]});assert.deepEqual(report({...id,question:id.question+' TEST80 PRO智能锁V9'}).countries,['ID']);
});
test('longer country names do not accidentally disclose or analyze their substring countries',()=>{
 for(const [name,code] of [['印度尼西亚','ID'],['南苏丹','SS'],['赤道几内亚','GQ'],['巴布亚新几内亚','PG'],['几内亚比绍','GW']])assert.deepEqual(countryMatches(name).map(c=>c.code),[code]);
});
