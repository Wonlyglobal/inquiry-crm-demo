import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("dashboard load failures are not rendered as real zero values", () => {
  assert.match(html, /id="dashboard-load-state"[^>]*role="status"/);
  assert.match(html, /当前数字不代表真实业务数据/);
  assert.match(html, /function renderDashboardUnavailable\(\)/);
  assert.match(html, /#hero-sales-cny"\)\.textContent = "—"/);
  assert.match(html, /#dashboard-retry"\)\.addEventListener\("click"/);
});

test("critical inquiry, stage, profile and owner historical-order errors abort rendering", () => {
  assert.match(html, /if \(error\) throw new Error\("询盘数据加载失败："/);
  assert.match(html, /if \(historyError\) throw new Error\("阶段时间加载失败："/);
  assert.match(html, /if \(profilesResult\.error\) throw new Error\("成员数据加载失败："/);
  assert.match(html, /profile\?\.role === "owner" && historicalOrdersResult\.error/);
});
