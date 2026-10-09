import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261009120000_sales_email_body_analysis_bridge.sql',import.meta.url),'utf8');
const summaryLoader=html.slice(html.indexOf('async function loadDashboardEmailObservationSummary'),html.indexOf('function renderDashboardEmailObservationPanel'));

test('dashboard exposes per-salesperson email observation without exposing message content in summary queries',()=>{
  assert.match(html,/id="dashboard-email-observation"/);
  assert.match(html,/id="dashboard-email-observation-search"/);
  assert.match(html,/id="dashboard-email-observation-pagination"/);
  assert.equal((summaryLoader.match(/select\("salesperson_id,status,created_at"\)/g)||[]).length,2);
  assert.doesNotMatch(summaryLoader,/\.select\([^)]*(?:analysis|evidence|body_text|subject)/i);
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

test('large teams are searchable and paginated at 20 sellers per page',()=>{
  assert.match(html,/const pageSize=20,pageCount=Math\.max\(1,Math\.ceil\(rows\.length\/pageSize\)\)/);
  assert.match(html,/data-email-observation-page="prev"/);
  assert.match(html,/data-email-observation-page="next"/);
  assert.match(html,/person=>String\(person\.full_name\|\|""\)\.toLocaleLowerCase\(\)\.includes\(search\)/);
});
