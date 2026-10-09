import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("full website intake monitor is a settings-only secondary panel", () => {
  assert.match(html, /websiteMonitorVisible=view==="settings"&&\["owner","marketing"\]\.includes\(profile\.role\)/);
  assert.match(html, /系统设置 · 监控官网表单同步、UTM 归因、处理延迟和失败重试/);
  assert.match(html, /if\(websiteMonitorVisible\)loadWebsiteIntakeMonitor\(\)/);
});

test("market center only surfaces website intake failures", () => {
  assert.match(html, /id="website-intake-alert" class="card hidden"/);
  assert.match(html, /\.eq\("status","failed"\)/);
  assert.match(html, /if\(error\|\|!\(data\|\|\[\]\)\.length\)return alert\.classList\.add\("hidden"\)/);
  assert.match(html, /marketing-open-website-monitor/);
  assert.match(html, /loadWebsiteIntakeAlert\(\)/);
});
