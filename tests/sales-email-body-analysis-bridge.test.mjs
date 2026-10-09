import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const originalSql=fs.readFileSync(new URL('../supabase/migrations/20261009120000_sales_email_body_analysis_bridge.sql',import.meta.url),'utf8');
const cloudSql=fs.readFileSync(new URL('../supabase/migrations/20261009150000_sales_email_bailian_scoped_processing.sql',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../supabase/functions/sales-email-body-analysis/index.ts',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const redaction=fs.readFileSync(new URL('../supabase/functions/sales-email-body-analysis/redaction.mjs',import.meta.url),'utf8');

test('persisted queue contains references and metadata only, never message bodies',()=>{
  assert.match(originalSql,/create table if not exists public\.sales_email_analysis_jobs/);
  assert.match(originalSql,/source_hash text not null/);
  assert.doesNotMatch(originalSql,/body_text|body_html|subject text/);
  assert.match(originalSql,/provider text not null check \(provider='company_internal_ollama'\)/);
  assert.match(cloudSql,/provider in \('company_internal_ollama','aliyun_bailian'\)/);
  assert.doesNotMatch((originalSql+cloudSql).replace(/^--.*$/gm,''),/score|rank|rating|total_score/i);
});

test('Edge Function restricts requests to owner, self-sales, or direct team manager',()=>{
  assert.match(api,/actor\.role==="sales"&&actor\.id!==salesperson\.id/);
  assert.match(api,/actor\.role==="sales_manager"&&actor\.team!==salesperson\.team/);
  assert.match(cloudSql,/actor_role='owner'/);
  assert.match(cloudSql,/actor_role='sales' and target_actor_id=target_salesperson_id/);
  assert.match(cloudSql,/actor_role='sales_manager' and actor_team is not distinct from salesperson_team/);
  assert.doesNotMatch(cloudSql,/marketing/);
});

test('only valid matched personal-mailbox threads are eligible and source hash is rechecked',()=>{
  assert.match(api,/eq\("validity","valid"\)/);
  assert.match(api,/eq\("excluded_from_dashboard",false\)/);
  assert.match(api,/eq\("mailbox_kind","personal"\)/);
  assert.match(api,/eq\("association_status","matched"\)/);
  assert.match(api,/in\("direction",\["inbound","outbound"\]\)/);
  assert.match(api,/source\.source_hash!==job\.source_hash/);
  assert.match(api,/\.or\(periodFilter\)/);
  assert.match(api,/\.limit\(301\)/);
});

test('scoped processing claim has bounded lock and transaction and checks active role/team in SQL',()=>{
  assert.match(cloudSql,/^begin;\s*set local lock_timeout = '3s';\s*set local statement_timeout = '30s';/);
  assert.match(cloudSql,/for update skip locked limit 1/);
  assert.match(cloudSql,/grant execute on function public\.claim_sales_email_analysis_job_for\(uuid,uuid,date\) to service_role/);
  assert.match(cloudSql,/drop function if exists public\.claim_sales_email_analysis_job\(\)/);
  assert.match(cloudSql,/notify pgrst,'reload schema';\s*commit;\s*$/);
});

test('Bailian call only receives local redaction output; no customer body, internal id or prompt is logged',()=>{
  assert.match(api,/const CRM_ORIGIN="https:\/\/crm\.foreverdoodle\.com"/);
  assert.match(api,/if\(origin&&origin!==CRM_ORIGIN\)return json\(\{error:"origin_not_allowed"\},403\)/);
  assert.doesNotMatch(api,/Access-Control-Allow-Origin":"\*"/);
  assert.match(api,/BAILIAN_CHAT_URL="https:\/\/dashscope\.aliyuncs\.com\/compatible-mode\/v1\/chat\/completions"/);
  assert.match(api,/Deno\.env\.get\("DASHSCOPE_API_KEY"\)/);
  assert.match(api,/BAILIAN_EMAIL_ANALYSIS_POLICY/);
  assert.match(api,/model:MODEL/);
  assert.match(api,/JSON\.stringify\(\{messages:safePayload\.excerpts\}\)/);
  assert.match(api,/redirect:"error"/);
  assert.match(api,/provider:"aliyun_bailian"/);
  assert.match(redaction,/const REDACTION_VERSION = "mail-minimum-excerpts-v1"/);
  assert.match(redaction,/sent_char_count/);
  assert.doesNotMatch(api,/console\.(?:log|error)\([^\n]*(?:body_text|safePayload|content)/i);
  assert.doesNotMatch(api,/SALES_EMAIL_ANALYSIS_BRIDGE_TOKEN|x-internal-worker-token|action==="poll"/);
});

test('AI output stays human-only with exact local evidence and no scoring effect',()=>{
  assert.match(api,/restoreEvidenceQuote\(/);
  assert.match(api,/source\.messages\.some\(\(message:any\)=>message\.id===restored\.message_id&&message\.body_text\.includes\(restored\.quote\)\)/);
  assert.match(api,/scoring_effect:false/);
  assert.match(api,/complete_sales_email_analysis_job/);
  assert.match(cloudSql,/create or replace function public\.complete_sales_email_analysis_job/);
  assert.match(cloudSql,/insert into public\.audit_logs/);
  assert.match(api,/fail_sales_email_analysis_job/);
  assert.match(cloudSql,/create or replace function public\.fail_sales_email_analysis_job/);
  assert.match(cloudSql,/sales_email_body_analysis_generated/);
  assert.match(api,/scoring_effect:false/);
  assert.match(html,/AI 邮件观察/);
  assert.match(html,/不计分、不改排名/);
  assert.match(html,/百炼分析进度/);
});
