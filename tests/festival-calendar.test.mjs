import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("follow calendar includes the festival banner and month grid", () => {
  assert.match(source, /id="festival-calendar"/);
  assert.match(source, /function renderFestivalCalendar\(activityRows=\[\]\)/);
  assert.match(source, /近期世界节日 & 营销节点/);
  assert.match(source, /节日与营销节点仅作业务提醒/);
  assert.match(source, /if\(view==="follow-calendar"\)renderFestivalCalendar\(sourceRows\)/);
});

test("festival dates include fixed, rule-based and dated events", () => {
  assert.match(source, /万圣节/);
  assert.match(source, /黑色星期五/);
  assert.match(source, /festivalEaster/);
  assert.match(source, /2027-02-06/);
});

test("mobile layout shows only the nearest upcoming festival", () => {
  assert.match(source, /\.festival-card:not\(:first-child\) \{ display:none; \}/);
  assert.match(source, /\.festival-weekdays,\.festival-grid \{ min-width:700px; \}/);
});
