import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915233000_personal_dashboard_preferences.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('./production-dashboard-preferences-rollback.sql',import.meta.url),'utf8');

test('dashboard preferences are private and browser writes use an authenticated workflow',()=>{
  assert.match(sql,/create table if not exists public\.dashboard_preferences/);
  assert.match(sql,/using\(user_id=\(select auth\.uid\(\)\)\)/);
  assert.match(sql,/revoke all on public\.dashboard_preferences from anon,authenticated/);
  assert.match(sql,/grant select on public\.dashboard_preferences to authenticated/);
  assert.match(sql,/create or replace function public\.save_dashboard_preferences/);
  assert.match(sql,/actor_id uuid := auth\.uid\(\)/);
  assert.match(sql,/dashboard_preferences_updated/);
});

test('dashboard workflow validates every persisted widget and core tab',()=>{
  assert.match(sql,/allowed_widgets constant text\[\]/);
  assert.match(sql,/allowed_collapsible constant text\[\]/);
  assert.match(sql,/count\(distinct item\)/);
  assert.match(sql,/actor_role='sales' and normalized_core_tab='leaderboards'/);
});

test('dashboard loads server preferences and saves layout collapse and tab together',()=>{
  assert.match(html,/loadDashboardPreferences\(\)/);
  assert.match(html,/from\("dashboard_preferences"\).*\.eq\("user_id",profile\.id\)\.maybeSingle\(\)/);
  assert.match(html,/supabase\.rpc\("save_dashboard_preferences",\{requested_widget_order:widgetOrder,requested_collapsed_widgets:collapsedWidgets,requested_core_tab:coreTab\}\)/);
  assert.match(html,/dashboardPreferenceSaveQueue=dashboardPreferenceSaveQueue\.catch\(\(\)=>\{\}\)\.then/);
  assert.doesNotMatch(html,/supabase\.auth\.updateUser\(\{data:\{dashboard_layout:/);
  assert.doesNotMatch(html,/supabase\.auth\.updateUser\(\{data:\{dashboard_collapsed:/);
});

test('production dashboard preference acceptance check is rollback-only',()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/DASHBOARD_PREFERENCES_NOT_SAVED/);
  assert.match(rollback,/INVALID_DASHBOARD_ORDER_ACCEPTED/);
  assert.match(rollback,/^rollback;/m);
});
