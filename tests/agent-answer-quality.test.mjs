import test from 'node:test';import assert from 'node:assert/strict';
import {answerIssues,correctionMessage} from '../supabase/functions/agent-conversation/answer-quality.mjs';
const context={seo:{status:'not_configured'},social:{published_28d:[{metric_status:'recorded_not_verified'}]}};
test('rejects observed fabricated thresholds and AI approval authority',()=>{assert.equal(answerIssues('留存率>45%为达标，Jay签字后发布',context).length,2);assert.match(correctionMessage(['问题']).content,/修正/)});
test('unverified engagement cannot establish performance without qualification',()=>{assert.ok(answerIssues('互动有限，属起步阶段',context).length);assert.deepEqual(answerIssues('互动是未验证记录，不能评价效果。SEO未取得数据，不等于零流量；目标待基线确认，人工负责人批准。',context),[])});

test('fallback is useful but explicitly distinguished from model analysis',async()=>{const {safeMarketingFallback}=await import('../supabase/functions/agent-conversation/answer-quality.mjs');const text=safeMarketingFallback(context);assert.match(text,/不是模型分析结论/);assert.match(text,/人类负责人/);assert.match(text,/目标待基线确认/);assert.deepEqual(answerIssues(text,context),[])});
test('post fallback preserves real page coverage rather than generic advice',async()=>{const {safeMarketingFallback}=await import('../supabase/functions/agent-conversation/answer-quality.mjs');const text=safeMarketingFallback({socialPosts:{status:'available',page:2,total_records:21,has_more:false,posts:[{title:'Example',platform:'youtube',metrics:{views:0}}]}});assert.match(text,/第2页/);assert.match(text,/共21条/);assert.match(text,/Example/);assert.match(text,/未核验/)});
