import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("CRM startup has a CDN fallback and bounded dependency loading", () => {
  assert.match(html, /importWithTimeout/);
  assert.match(html, /esm\.sh\/@@?supabase|esm\.sh\/\@supabase/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/\@supabase\/supabase-js/);
  assert.match(html, /Supabase 客户端加载失败/);
});

test("CRM startup surfaces Supabase session failures instead of leaving the boot screen", () => {
  assert.match(html, /let sessionError = null/);
  assert.match(html, /数据服务暂时无法连接，请检查网络后重试/);
  assert.match(html, /supabase\.auth\.getSession\(\)/);
});
