import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("editing login credentials clears stale authentication feedback", () => {
  assert.match(html, /\["login-email", "login-password"\]\.forEach/);
  assert.match(html, /addEventListener\("input"/);
  assert.match(html, /errorBox\.textContent = ""/);
  assert.match(html, /errorBox\.style\.removeProperty\("color"\)/);
});

test("login feedback distinguishes credentials, throttling, and connectivity failures", () => {
  assert.match(html, /function formatLoginError\(error\)/);
  assert.match(html, /invalid_credentials/);
  assert.match(html, /登录尝试过于频繁，请稍后再试/);
  assert.match(html, /认证服务暂时无法连接，请检查网络后重试/);
  assert.match(html, /登录失败，请稍后重试；如持续出现请联系管理员/);
});

test("login submission always re-enables the submit button", () => {
  assert.match(html, /finally \{\s*btn\.disabled = false;/);
});

test("a transient profile fetch failure preserves the authenticated session", () => {
  assert.match(html, /await loadProfileWithRetry\(data\.user\)/);
  assert.match(html, /账号档案暂时无法加载，登录状态已保留，请刷新或稍后重试/);
  assert.match(html, /if \(permanentProfileFailure\) await supabase\.auth\.signOut\(\)/);
});
