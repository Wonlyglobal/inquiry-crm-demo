import test from 'node:test';import assert from 'node:assert/strict';
import {evidencePlan,analysisIntent} from '../supabase/functions/agent-conversation/deep-analysis.mjs';
import {knowledgeRoute} from '../supabase/functions/agent-conversation/knowledge-routing.mjs';
test('combined marketing requests load authorized summaries; ordinary questions do not',()=>{
 const r=knowledgeRoute('分析我们整体营销的优化方案');for(const k of ['seo','social','crm','research'])assert.equal(r[k],true);
 assert.equal(knowledgeRoute('你好').social,false);assert.equal(analysisIntent('谢谢'),false);
});
test('evidence distinguishes missing, zero-valued and stale without leaking source records',()=>{
 const p=evidencePlan({seo:{status:'unavailable'},research:{sample_count:0,as_of:'2026-09-01',companies:[{secret:'hidden'}]},social:{status:'available',generated_at:'bad'}},Date.parse('2026-09-26'));
 assert.deepEqual(p.missing,['seo']);assert.equal(p.sources[1].stale,true);assert.equal(p.sources[2].observed_at,null);assert.doesNotMatch(JSON.stringify(p),/hidden|companies/);
});
test('internal materials remain routed to company system even for deep requests',()=>{
 assert.equal(knowledgeRoute('深度分析我们产品手册并给优化建议').materials,true);
});
