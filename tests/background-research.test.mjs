import test from 'node:test';import assert from 'node:assert/strict';
import {backgroundIntent,countryBrief,backgroundContext,countryBriefInstruction,companyCheckInstruction} from '../supabase/functions/agent-conversation/background-research.mjs';
import {researchSummary} from '../supabase/functions/agent-conversation/research.mjs';
import {competitorIntent} from '../supabase/functions/agent-conversation/public-research.mjs';
const companies=[...Array(7)].map(()=>({country:'SA',categoryName:'进口商/经销商'})).concat([...Array(3)].map(()=>({country:'SA',categoryName:'建筑总包'})),[...Array(6)].map(()=>({country:'MX',categoryName:'五金/建材零售'})));
const research=researchSummary({generatedAt:'2026-09-20',companies});
const crm={status:'available',period:{start:'a',end:'b'},countries:[{label:'SA',count:6}]};
test('research keeps the >=5 disclosure floor per country category',()=>{
 assert.deepEqual(research.country_categories.SA,[{label:'进口商/经销商',count:7}]);
 assert.ok(!JSON.stringify(research).match(/建筑总包"?,"count":3/));
});
test('intent separates country market and single company checks',()=>{
 assert.deepEqual(backgroundIntent('沙特防火门市场背调'),{countries:['SA'],company:false,market:true});
 assert.equal(backgroundIntent('这家客户靠谱吗').company,true);assert.equal(backgroundIntent('渠道质量怎么样').market,false);
 assert.equal(competitorIntent('沙特市场背调 竞品'),null);
});
test('country brief uses only aggregates and public evidence, and states gaps instead of zeros',()=>{
 const b=countryBrief('SA',{research,crm});
 assert.equal(b.research_sample,10);assert.equal(b.crm_recent_leads,6);assert.ok(b.public_competitor_evidence.some(e=>/FHC/.test(e.company)));
 assert.ok(b.gaps.some(g=>/准入标准/.test(g)));assert.ok(!JSON.stringify(b).match(/@|电话|联系人/));
 const mx=countryBrief('MX',{research,crm});assert.equal(mx.crm_recent_leads,null);assert.ok(mx.gaps.some(g=>/不代表零/.test(g)));
 const none=countryBrief('KE',{research:{status:'unavailable'},crm:{status:'unavailable'}});assert.ok(none.gaps.length>=4);
});
test('instructions forbid invented facts for both kinds of background checks',()=>{
 assert.match(countryBriefInstruction,/不得断言具体法规条款/);assert.match(countryBriefInstruction,/待基线确认/);
 assert.match(companyCheckInstruction,/不得编造注册号/);assert.match(companyCheckInstruction,/未独立核验/);
 const c=backgroundContext('帮我做沙特和阿联酋的市场背调',{research,crm});assert.deepEqual(c.countryBriefs.map(b=>b.country),['SA','AE']);assert.match(c.instruction,/国家市场背调/);
 assert.equal(backgroundContext('本月渠道质量',{research,crm}).instruction,'');
});
