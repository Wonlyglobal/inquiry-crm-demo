import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("official inquiry mailbox stays separate from the signed-in personal account", () => {
  assert.match(html, /官方询盘邮箱 inquiry@wonlyglobal\.com/);
  assert.match(html, /登录账号与公共邮箱相互独立/);
  assert.match(html, /处理 inquiry@wonlyglobal\.com 的来信/);
});

test("owner operations manager can use the marketing workbench", () => {
  assert.match(html, /marketingWorkbenchView=\["owner","marketing"\]\.includes\(role\)/);
  assert.match(html, /classList\.toggle\("hidden",!marketingWorkbenchView\)/);
  assert.match(html, /if\(!\["owner","marketing"\]\.includes\(profile\?\.role\)\)return/);
  assert.match(html, /if\(!panel\|\|!\["owner","marketing"\]\.includes\(profile\?\.role\)\)return/);
});
