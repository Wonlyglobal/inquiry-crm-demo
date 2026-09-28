import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seoSummary} from '../supabase/functions/agent-conversation/seo.mjs';
import {seoIntent,seoOpportunities,seoFrameworkInstruction} from '../supabase/functions/agent-conversation/seo-opportunities.mjs';
import {suite,buildPrompt} from '../scripts/grace-eval.mjs';
const NOW=Date.parse('2026-09-28T03:00:00Z');
const seo=seoSummary(JSON.parse(readFileSync(new URL('./evals/grace-eval-cases.json',import.meta.url))).fixtures.seo_raw,NOW);
test('opportunities rank P1 issues first and cite page evidence from the summary only',()=>{
 const o=seoOpportunities(seo,NOW);const types=o.items.map(i=>i.type+':'+i.path);
 assert.equal(o.items[0].type,'fix_p1_issue');assert.equal(o.items[0].path,'/projects/hospital-doors');
 assert.ok(types.includes('improve_snippet:/products/fire-rated-doors'));assert.ok(types.includes('strengthen_content:/products/fire-rated-doors'));
 assert.ok(types.includes('review_experiment:/products/fire-rated-doors'));assert.deepEqual(o.markets_without_data,['MX']);
 assert.ok(!types.some(t=>t.startsWith('fix_p1_issue:/products/steel')),'P2 is not promoted to P1');
 for(const i of o.items){assert.ok(i.metric&&i.observe);assert.match(i.evidence,/\d/)}
});
test('no summary means no invented opportunities',()=>{
 assert.equal(seoOpportunities({status:'unavailable'}).items.length,0);assert.equal(seoOpportunities(null).status,'unavailable');
});
test('experiments not yet due are not reviewed early',()=>{
 const early=seoOpportunities(seo,Date.parse('2026-09-20T00:00:00Z'));assert.ok(!early.items.some(i=>i.type==='review_experiment'));
});
test('SEO questions get the framework and exam prompts carry the opportunities',()=>{
 assert.equal(seoIntent('网站SEO现在最该先做哪三件事？'),true);assert.equal(seoIntent('这家客户靠谱吗'),false);
 assert.match(seoFrameworkInstruction,/待GSC查询验证/);assert.match(seoFrameworkInstruction,/不承诺排名/);
 const p=buildPrompt(suite.cases.find(c=>c.id==='seo-01')).messages[0].content;assert.match(p,/seoOpportunities/);assert.match(p,/NOINDEX_TAG/);
 assert.ok(!buildPrompt(suite.cases.find(c=>c.id==='seo-01'),suite,{legacy:true}).messages[0].content.includes('seoOpportunities'));
 assert.ok(suite.cases.filter(c=>c.category==='seo').length>=8);
});
