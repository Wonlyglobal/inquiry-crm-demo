import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {countryMatches,productMarketTurn,marketFollowupClarification} from '../supabase/functions/agent-conversation/product-market.mjs';
const history=['产品市场：TEST80 PRO智能锁越南市场分析'];
test('the common Indonesia abbreviation resolves without India and keeps unversioned product context',()=>{
 const q=productMarketTurn('那印尼呢',history);
 assert.match(q,/TEST80 PRO/);assert.deepEqual(countryMatches(q).map(c=>c.code),['ID']);
 assert.doesNotMatch(q,/v9/i);assert.equal(marketFollowupClarification('那印尼呢',history),null);
});
test('an unresolved short market followup stays internal, preserves only query context, and cannot invent a country',()=>{
 const r=marketFollowupClarification('那这个地方呢',history);
 assert.equal(r.material_question,history[0]);assert.match(r.answer,/尚未重新查询/);
 assert.equal(productMarketTurn('那这个地方呢',history),null);
 for(const q of ['介绍我们CRM系统','新需求：其他问题','分析TEST80 PRO新加坡市场'])assert.equal(marketFollowupClarification(q,history),null);
 assert.equal(marketFollowupClarification('那这个地方呢',[]),null);
});
test('actual handler audits internal clarification and does not load materials or invoke a provider',async()=>{
 const src=fs.readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.match(src,/nested\|\|guest\|\|marketTurn\|\|marketClarification/);
 const branch=src.slice(src.indexOf('   if(marketClarification){'),src.indexOf('   if(marketTurn){'));
 let audited=false;
 const deps={marketClarification:marketFollowupClarification('那这个地方呢',history),guest:false,admin:{from:()=>({insert:async row=>{audited=row.after_data.provider==='internal';return {error:null}}})},user:{id:'synthetic'},input:{persona:'Grace'},action:'chat',key:'synthetic',ticket:async()=>null,json:x=>x};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const r=await new AsyncFunction(...Object.keys(deps),branch)(...Object.values(deps));
 assert.equal(audited,true);assert.equal(r.provider,'internal');assert.equal(r.context.status,'clarification');assert.equal(r.context.material_question,history[0]);
 assert.doesNotMatch(branch,/loadFullMaterials|providerJson|fetch\(/);
});

test('natural analyse-product-market wording routes internally even without SWOT or adjacent market-analysis words',async()=>{
 const {productMarketIntent}=await import('../supabase/functions/agent-conversation/product-market.mjs');
 for(const q of ['只分析智能锁画册v9的TEST80 PRO在马来西亚的市场，保留来源','分析TEST80 Basic在肯尼亚的市场','评估TEST80 PRO的越南市场','Analyse the TEST80 PRO market in Vietnam'])assert.equal(productMarketIntent(q),true);
 for(const q of ['TEST80 PRO的尺寸是多少','分析TEST80 PRO安装视频画面'])assert.equal(productMarketIntent(q),false);
});
