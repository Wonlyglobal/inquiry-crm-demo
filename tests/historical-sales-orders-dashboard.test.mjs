import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260922210000_historical_sales_orders_dashboard.sql", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("historical orders are owner-only, idempotent and auditable", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /private\.current_crm_role\(\)<>'owner'/);
  assert.match(migration, /unique \(source_sha256, source_row\)/);
  assert.match(migration, /on conflict\(source_sha256,source_row\) do update/);
  assert.match(migration, /historical_sales_orders_imported/);
  assert.match(migration, /historical_sales_orders_import_rolled_back/);
  assert.match(migration, /'customer_content_in_audit',false/);
});

test("dashboard counts unique orders while summing every source line", () => {
  assert.match(html, /id="historical-orders-dashboard"/);
  assert.match(html, /new Set\(rows\.map\(x=>x\.order_no\)\)\.size/);
  assert.match(html, /sum\+Number\(x\.amount_wan\|\|0\)/);
  assert.match(html, /订单数按订单号去重，金额按全部明细累计/);
  assert.match(html, /历史工程 \/ 订单/);
  assert.match(html, /销售额（CRM成交＋导入订单）/);
  assert.match(html, /panel\.classList\.remove\("hidden"\)/);
  assert.match(html, /previousImportedCny/);
  assert.match(html, /profile\?\.role==="owner"\?loadModuleRowsPaged/);
});

test("verified source totals are documented without embedding customer content", () => {
  assert.match(migration, /jsonb_array_length\(p_rows\)>500/);
  assert.match(migration, /count\(distinct order_no\)/);
  assert.doesNotMatch(migration, /澳门南湾湖法院|津巴布韦哈拉雷慈济诊所/);
});
