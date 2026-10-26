import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../assets/daily-report-ui.mjs',import.meta.url),'utf8');
const helpers=fs.readFileSync(new URL('../assets/daily-lead-reporting.mjs',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20260922183000_daily_report_draft_submit_workflow.sql',import.meta.url),'utf8');
const unified=fs.readFileSync(new URL('../supabase/migrations/20261026130000_unified_daily_lead_reports.sql',import.meta.url),'utf8');
const seed=fs.readFileSync(new URL('../supabase/migrations/20260922184000_seed_september_simulated_daily_reports.sql',import.meta.url),'utf8');
const enriched=fs.readFileSync(new URL('../supabase/migrations/20260922200000_enrich_simulated_daily_reports.sql',import.meta.url),'utf8');

test('sales daily report exposes separate draft and submit actions',()=>{
  assert.match(html,/id="save-daily-draft"[\s\S]*保存草稿/);
  assert.match(html,/id="submit-daily"[\s\S]*提交日报/);
  assert.match(html,/createDailyReportController\(\{[^\n]+confirm:appConfirm/);
  assert.match(html,/dailyReportController\.save\(submitReport\)/);
  assert.match(ui,/if\(submitReport&&!await confirm\('确认提交这份日报/);
  assert.match(ui,/save_or_submit_daily_report/);
  assert.doesNotMatch(html,/今日跟进次数/);
  assert.doesNotMatch(html,/id="daily-kpi-followups"/);
});

test('simulated September reports are detailed and non-zero without touching real reports',()=>{
  assert.match(enriched,/where r\.is_simulated/);
  assert.match(enriched,/simulation_batch='september-2026-manager-demo-v1'/);
  assert.match(enriched,/new_leads_count=case[\s\S]*?then 2\+/);
  assert.match(enriched,/follow_up_count=case[\s\S]*?then 5\+/);
  assert.match(enriched,/完成阿联酋酒店项目防火门五金清单核对/);
  assert.match(enriched,/客户尚未提供完整门表和五金节点图/);
  assert.match(enriched,/上午完成配置表复核并发客户确认/);
  assert.doesNotMatch(enriched,/not r\.is_simulated/);
  assert.match(enriched,/real_reports_untouched/);
});

test('daily report uses the branded calendar instead of the browser native picker',()=>{
  assert.match(html,/id="daily-date" type="hidden"/);
  assert.match(html,/id="daily-date-popover"/);
  assert.match(html,/function renderDailyDatePicker/);
  assert.doesNotMatch(html,/id="daily-date"[^>]*type="date"/);
});

test('manager summary excludes drafts',()=>{
  assert.match(ui,/\.eq\('status',\s*'submitted'\)/);
  assert.match(ui,/\.not\('submitted_at','is',null\)/);
  assert.match(ui,/submittedDailySalesIds\(realReports,date,people\)/);
  assert.match(helpers,/report\.status==='submitted'&&report\.submitted_at&&!report\.is_simulated&&report\.report_date===reportDate/);
  assert.match(html,/submittedDailySalesIds\(dashboardState\.dailyReports\|\|\[\],chinaDate\(\),dashboardState\.dailyManagementPeople\|\|\[\]\)/);
  assert.match(html,/\.eq\("status","submitted"\)\.eq\("is_simulated",false\)\.not\("submitted_at","is",null\)/);
});

test('manager list labels simulations and excludes them from official KPIs',()=>{
  assert.match(ui,/row\.is_simulated\?'模拟数据':'正式日报'/);
  assert.match(ui,/const realReports=reports\.filter\(x=>!x\.is_simulated\)/);
  assert.match(seed,/september-2026-manager-demo-v1/);
  assert.match(seed,/where not exists[\s\S]+not r\.is_simulated/);
  assert.match(seed,/2026-09-01/);
  assert.match(seed,/2026-09-22/);
  assert.match(seed,/is_simulated boolean not null default false/);
  assert.match(seed,/as g\(report_day\)/);
  assert.doesNotMatch(seed,/lateral/);
});

test('server workflow owns counts, status, role checks and audit',()=>{
  assert.match(unified,/actor\.role <> 'sales'/);
  assert.match(unified,/select count\(\*\) into lead_count from private\.sales_leads/);
  assert.match(unified,/recorded_on=target_date and recorded_at<=cutoff/);
  assert.match(unified,/count\(distinct inquiry_id\) into conversion_count/);
  assert.doesNotMatch(unified,/into lead_count from public\.inquiries/);
  assert.match(sql,/status in\('draft','submitted'\)/);
  assert.match(unified,/daily_report_draft_saved/);
  assert.match(unified,/daily_report_submitted/);
  assert.match(unified,/revoke all on function public\.save_or_submit_daily_report/);
  assert.match(unified,/existing\.status='submitted'[\s\S]+deduplicated/);
});
