import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20261009120000_sales_email_body_analysis_bridge.sql',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../supabase/functions/sales-email-body-analysis/index.ts',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../internal-mail-analysis/worker.py',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../internal-mail-analysis/model-gateway/gateway.py',import.meta.url),'utf8');
const proxy=fs.readFileSync(new URL('../internal-mail-analysis/egress-proxy/proxy.py',import.meta.url),'utf8');
const compose=fs.readFileSync(new URL('../internal-mail-analysis/compose.yml',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('persisted queue contains references and metadata only, never message bodies',()=>{
  assert.match(sql,/create table if not exists public\.sales_email_analysis_jobs/);
  assert.match(sql,/source_hash text not null/);
  assert.doesNotMatch(sql,/body_text|body_html|subject text/);
  assert.match(sql,/provider text not null check \(provider='company_internal_ollama'\)/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/score|rank|rating|total_score/i);
});

test('access to requests and results is owner, self-sales, or direct team manager only',()=>{
  assert.match(api,/actor\.role==="sales"&&actor\.id!==sales\.id/);
  assert.match(api,/actor\.role==="sales_manager"&&actor\.team!==sales\.team/);
  assert.match(sql,/actor\.role='owner'/);
  assert.match(sql,/actor\.role='sales' and actor\.id=salesperson\.id/);
  assert.match(sql,/actor\.role='sales_manager' and actor\.team is not distinct from salesperson\.team/);
  assert.doesNotMatch(sql,/marketing/);
});

test('only matched personal-mailbox messages from valid, assigned inquiries are submitted',()=>{
  assert.match(api,/eq\("validity","valid"\)/);
  assert.match(api,/eq\("excluded_from_dashboard",false\)/);
  assert.match(api,/eq\("mailbox_kind","personal"\)/);
  assert.match(api,/eq\("association_status","matched"\)/);
  assert.match(api,/in\("direction",\["inbound","outbound"\]\)/);
  assert.match(api,/source_hash!==job\.source_hash/);
  assert.match(api,/\.or\(periodFilter\)/);
  assert.match(api,/\.limit\(301\)/);
});

test('database deployment has a bounded lock and statement time inside one transaction',()=>{
  assert.match(sql,/^begin;\s*set local lock_timeout = '3s';\s*set local statement_timeout = '30s';/);
  assert.match(sql,/notify pgrst,'reload schema';\s*commit;\s*$/);
});

test('worker is internal-only, human observation, no score/rank and evidence is source-validated',()=>{
  assert.match(worker,/打分、不排名/);
  assert.match(worker,/message_id/);
  assert.match(api,/String\(sourceById\.get\(item\.message_id\)\|\|""\)\.includes\(item\.quote\)/);
  assert.match(api,/scoring_effect:false/);
  assert.match(compose,/internal: true/);
  assert.match(compose,/read_only: true/);
  assert.doesNotMatch(worker,/print\([^\n]*(body|prompt|messages)/i);
});

test('360 workspace exposes a human-only email observation entry, separate from scoring actions',()=>{
  assert.match(html,/AI 邮件观察/);
  assert.match(html,/申请正文分析/);
  assert.match(html,/review_sales_email_analysis/);
  assert.match(html,/不计分、不改排名/);
  assert.match(html,/查看原询盘/);
});

test('model and egress gateways expose only the required routes and host',()=>{
  assert.match(gateway,/request_line\[1\] != "\/api\/chat"/);
  assert.match(gateway,/request_line\[0\] != "POST"/);
  assert.match(gateway,/length > 1_000_000/);
  assert.match(proxy,/ALLOWED = "plhverjihjilnuhlhlxi\.supabase\.co"/);
  assert.match(proxy,/first\[0\] != "CONNECT"/);
  assert.match(proxy,/first\[1\] != ALLOWED \+ ":443"/);
});
