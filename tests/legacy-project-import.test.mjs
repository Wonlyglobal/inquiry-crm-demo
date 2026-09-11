import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const sql = await readFile(new URL("../supabase/migrations/20260911072000_legacy_project_excel_import.sql", import.meta.url), "utf8");

test("历史工程提供 Excel 模板和导入入口", () => {
  assert.match(html, /id="legacy-project-template"/);
  assert.match(html, /id="legacy-project-import-file"[^>]+accept="\.xlsx,\.xls,\.csv"/);
  assert.match(html, /import_legacy_engineering_projects/);
  assert.match(html, /capability-check/);
});

test("历史工程导入服务端校验角色并按旧 ID 幂等更新", () => {
  assert.match(sql, /private\.current_crm_role\(\) not in \('owner','sales_manager','marketing'\)/);
  assert.match(sql, /create or replace function private\.import_legacy_engineering_projects/);
  assert.match(sql, /create or replace function public\.import_legacy_engineering_projects[\s\S]*security invoker/);
  assert.match(sql, /on conflict \(legacy_project_id\) do update/);
  assert.match(sql, /jsonb_array_length\(p_rows\) > 10000/);
});

test("历史工程列表分页读取，避免默认 API 页大小截断", () => {
  const start = html.indexOf('} else if (view === "legacy-projects")');
  const branch = html.slice(start, html.indexOf('} else {', start));
  assert.match(branch, /pageSize=500/);
  assert.match(branch, /\.range\(from,from\+pageSize-1\)/);
  assert.doesNotMatch(branch, /\.limit\(1000\)/);
});
