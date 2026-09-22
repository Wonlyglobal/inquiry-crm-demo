import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20260922183000_daily_report_draft_submit_workflow.sql',import.meta.url),'utf8');
const seed=fs.readFileSync(new URL('../supabase/migrations/20260922184000_seed_september_simulated_daily_reports.sql',import.meta.url),'utf8');
const enriched=fs.readFileSync(new URL('../supabase/migrations/20260922200000_enrich_simulated_daily_reports.sql',import.meta.url),'utf8');

test('sales daily report exposes separate draft and submit actions',()=>{
  assert.match(html,/id="save-daily-draft"[\s\S]*保存草稿/);
  assert.match(html,/id="submit-daily"[\s\S]*提交日报/);
  assert.match(html,/appConfirm\("确认提交这份日报/);
  assert.match(html,/save_or_submit_daily_report/);
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
  const manager=html.slice(html.indexOf('if (isManager)'),html.indexOf('} else if (profile.role === "sales")'));
  assert.match(manager,/\.eq\("status", "submitted"\)/);
});

test('manager list labels simulations and excludes them from official KPIs',()=>{
  assert.match(html,/x\.is_simulated\?"模拟数据":"正式日报"/);
  assert.match(html,/const realReports=\(reports\|\|\[\]\)\.filter\(x=>!x\.is_simulated\)/);
  assert.match(seed,/september-2026-manager-demo-v1/);
  assert.match(seed,/where not exists[\s\S]+not r\.is_simulated/);
  assert.match(seed,/2026-09-01/);
  assert.match(seed,/2026-09-22/);
  assert.match(seed,/is_simulated boolean not null default false/);
  assert.match(seed,/as g\(report_day\)/);
  assert.doesNotMatch(seed,/lateral/);
});

test('server workflow owns counts, status, role checks and audit',()=>{
  assert.match(sql,/actor_role is distinct from 'sales'/);
  assert.match(sql,/select count\(\*\) into lead_count from public\.inquiries/);
  assert.match(sql,/status in\('draft','submitted'\)/);
  assert.match(sql,/daily_report_draft_saved/);
  assert.match(sql,/daily_report_submitted/);
  assert.match(sql,/revoke all on function public\.save_or_submit_daily_report/);
});
