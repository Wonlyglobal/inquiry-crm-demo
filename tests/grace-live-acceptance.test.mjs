import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {evidenceCheck,sourceStatusIntent,sourceStatusAnswer} from '../supabase/functions/agent-conversation/acceptance-status.mjs';
test('acceptance report returns structural counts without internal facts or model verdicts',()=>{
 const privateValue='INTERNAL_SECRET_PARAMETER';const d={status:'available',assets:[{name:privateValue,document:{pages:[{chunks:[privateValue]}],product_understanding:{findings:[{value:privateValue}]}}}],evidence_gate:{rejected:2}};
 assert.deepEqual(evidenceCheck(d),{source_status:'available',source_code:null,assets:1,pages:1,findings:1,rejected:2,source_freshness_verified:false,human_verified:false});assert.ok(!JSON.stringify(evidenceCheck(d)).includes(privateValue));
 assert.equal(evidenceCheck({status:'unavailable',code:'connection_failed',assets:d.assets}).assets,0);
});
test('source status preserves unavailable and dates without pretending missing is zero',()=>{
 assert.equal(sourceStatusIntent('检查SEO和社媒接入状态'),true);assert.equal(sourceStatusIntent('分析SEO表现并制定优化方案'),false);
 const text=sourceStatusAnswer({status:'unavailable'},{status:'unavailable'});assert.match(text,/读取失败/);assert.match(text,/未知/);assert.match(text,/不能记为零/);
 const ok=sourceStatusAnswer({status:'available',generated_at:'2026-10-15T01:00:00Z',freshness:{gsc:{status:'stale',through:'2026-10-10'},ga4:{status:'ok',through:'2026-10-13'}}},{status:'partial',generated_at:'invalid'});assert.match(ok,/2026-10-10/);assert.match(ok,/数据已过期/);assert.match(ok,/部分可用/);
});
test('private material paths return before unrelated external enrichment; diagnostics are bounded',()=>{
 const src=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.ok(src.indexOf("if(route.materials){const {error:materialAuditError}")<src.indexOf('const explicitSocialPage='));
 assert.ok(src.indexOf('sourceStatusIntent(input.question)')<src.indexOf('const explicitSocialPage='));
 assert.match(src,/materialAuditError\)return json/);assert.match(src,/evidence_check:evidenceCheck\(materials\)/);
 const ui=readFileSync(new URL('../assets/agent-conversation.mjs',import.meta.url),'utf8');assert.match(ui,/delete host.dataset.graceEvidenceCheck/);assert.match(ui,/human_verified:false/);
});
