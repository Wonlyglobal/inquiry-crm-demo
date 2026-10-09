import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261009120000_sales_email_body_analysis_bridge.sql',import.meta.url),'utf8');
const metricsMigration=fs.readFileSync(new URL('../supabase/migrations/20261009170000_dashboard_email_activity_metrics.sql',import.meta.url),'utf8');
const summaryLoader=html.slice(html.indexOf('async function loadDashboardEmailObservationSummary'),html.indexOf('function renderDashboardEmailObservationPanel'));

test('dashboard exposes per-salesperson email observation without exposing message content in summary queries',()=>{
  assert.match(html,/id="dashboard-email-observation"/);
  assert.match(html,/id="dashboard-email-observation-search"/);
  assert.match(html,/id="dashboard-email-observation-pagination"/);
  assert.match(summaryLoader,/rpc\("get_sales_email_activity_metrics"/);
  assert.doesNotMatch(summaryLoader,/\.from\("sales_email_analysis_(?:results|jobs)"\)/);
  assert.doesNotMatch(summaryLoader,/\.select\([^)]*(?:analysis|evidence|body_text|subject|sender_email|recipient_emails)/i);
  for(const label of ['CRM 开发信','客户来信','7 天开发信回复率','业务员 24 小时内回复','待业务员回复','AI 待人工复核','每日邮件活动']) assert.ok(html.includes(label),`missing ${label}`);
  assert.match(html,/data-email-observation-sales/);
  assert.match(html,/openSalesEmailAnalysis\(\{sales_id:person\.id,sales_name:person\.full_name,period_start:/);
});

test('dashboard summary honors self/team/global scope and keeps observations separate from scoring',()=>{
  assert.match(html,/async function loadDashboardEmailObservationSummary\(month\)\{\s*if\(!\["owner","sales_manager","sales"\]\.includes\(profile\?\.role\)\)return;/);
  assert.match(html,/if\(profile\.role==="sales"\)people=people\.filter\(person=>person\.id===profile\.id\)/);
  assert.match(html,/else if\(profile\.role==="sales_manager"\)people=people\.filter\(person=>person\.team===profile\.team\)/);
  assert.match(migration,/actor\.role='owner'/);
  assert.match(migration,/actor\.role='sales' and actor\.id=salesperson\.id/);
  assert.match(migration,/actor\.role='sales_manager' and actor\.team is not distinct from salesperson\.team/);
  assert.match(html,/不计分、不改排名/);
  assert.match(html,/评分和排名未改变/);
});

test('email activity RPC is aggregate-only, scoped, thread-aware, and observational',()=>{
  assert.match(metricsMigration,/create or replace function public\.get_sales_email_activity_metrics/);
  assert.match(metricsMigration,/security definer[\s\S]+set search_path=''/);
  assert.match(metricsMigration,/actor_role not in \('owner','sales_manager','sales'\)/);
  assert.match(metricsMigration,/actor_role='owner'/);
  assert.match(metricsMigration,/actor_role='sales_manager' and p\.team is not distinct from actor_team/);
  assert.match(metricsMigration,/actor_role='sales' and p\.id=actor/);
  assert.match(metricsMigration,/e\.action='outreach_email_sent'/);
  assert.match(metricsMigration,/incoming\.in_reply_to=x\.message_id or x\.message_id=any/);
  assert.match(metricsMigration,/sent_at<=clock_timestamp\(\)-interval '7 days'/);
  assert.match(metricsMigration,/status='open' and r\.received_at<=clock_timestamp\(\)-interval '24 hours'/);
  assert.match(metricsMigration,/pending_human_review/);
  assert.match(metricsMigration,/scoring_policy','observation_only_no_score_or_rank_effect/);
  assert.match(metricsMigration,/revoke all on function public\.get_sales_email_activity_metrics\(date\) from public,anon/);
  assert.match(metricsMigration,/grant execute on function public\.get_sales_email_activity_metrics\(date\) to authenticated/);
  assert.doesNotMatch(metricsMigration,/body_text|body_html|subject|sender_email|recipient_emails/);
});

test('large teams are searchable and paginated at 20 sellers per page',()=>{
  assert.match(html,/const pageSize=20,pageCount=Math\.max\(1,Math\.ceil\(rows\.length\/pageSize\)\)/);
  assert.match(html,/data-email-observation-page="prev"/);
  assert.match(html,/data-email-observation-page="next"/);
  assert.match(html,/person=>String\(person\.full_name\|\|""\)\.toLocaleLowerCase\(\)\.includes\(search\)/);
});
