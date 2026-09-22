import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("CRM startup has a CDN fallback and bounded dependency loading", () => {
  assert.match(html, /importWithTimeout/);
  assert.match(html, /esm\.sh\/@@?supabase|esm\.sh\/\@supabase/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/\@supabase\/supabase-js/);
  assert.match(html, /unpkg\.com\/\@supabase\/supabase-js/);
  assert.match(html, /unpkg\.com\/\@supabase\/supabase-js@2\.57\.4\/dist\/module\/index\.js/);
  assert.match(html, /Supabase 客户端加载失败/);
});

test("CRM startup surfaces Supabase session failures instead of leaving the boot screen", () => {
  assert.match(html, /let sessionError = null/);
  assert.match(html, /数据服务暂时无法连接，请检查网络后重试/);
  assert.match(html, /supabase\.auth\.getSession\(\)/);
  assert.match(html, /认证服务连接超时/);
  assert.match(html, /setTimeout\(\(\) => reject\(new Error\("认证服务连接超时"\)\), 15000\)/);
});

test("CRM startup retries transient profile failures without clearing a valid session", () => {
  assert.match(html, /const withTimeout = \(promise, timeoutMs, message\)/);
  assert.match(html, /async function loadProfileWithRetry\(user, attempts = 3\)/);
  assert.match(html, /await loadProfileWithRetry\(session\.user\)/);
  assert.match(html, /preservedSessionFailure = true/);
  assert.match(html, /登录状态仍保留，账号资料暂时加载失败/);
  assert.match(html, /id="session-retry"/);
  assert.match(html, /无需再次输入密码/);
});

test("CRM startup only clears sessions for permanent disabled or missing profiles", () => {
  assert.match(html, /permanentProfileFailure = \/管理员禁用\|PGRST116\|0 rows\/i/);
  assert.match(html, /withTimeout\(supabase\.auth\.signOut\(\), 5000, "登录状态清理超时"\)/);
});

test("CRM startup converts unexpected bootstrap errors into a reloadable state", () => {
  assert.match(html, /const showBootFailure = \(message = "页面初始化失败，请刷新后重试"\)/);
  assert.match(html, /window\.addEventListener\("error"/);
  assert.match(html, /window\.addEventListener\("unhandledrejection"/);
  assert.match(html, /CRM 暂时无法打开/);
});
