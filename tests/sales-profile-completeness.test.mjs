import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("个人业务主页展示全部已加载的跟进记录", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const start = html.indexOf("function openSalesProfilePage");
  const end = html.indexOf("const openSalesDashboardDetail", start);
  assert.ok(start >= 0 && end > start, "找不到个人业务主页渲染逻辑");
  const source = html.slice(start, end);
  assert.match(source, /memberFollowups\.slice\(\)\.sort\(/);
  assert.doesNotMatch(source, /memberFollowups\.slice\(\)\.sort\([^;]+\)\.slice\(0,\s*100\)/);
});
