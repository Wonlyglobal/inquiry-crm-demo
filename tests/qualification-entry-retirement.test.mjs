import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("qualification is removed from the visible inquiry tabs without deleting protected history",()=>{
  assert.doesNotMatch(html,/data-detail-tab="qualification"/);
  assert.match(html,/data-detail-section="qualification"/);
  assert.match(html,/qualification_manager_confirmed_at/);
  assert.match(html,/inquiry_qualification_prefill/);
});
