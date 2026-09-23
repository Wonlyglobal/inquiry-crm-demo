import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("bulk email conversion is visually inactive until mail is selected",()=>{
  assert.match(html,/id="email-convert-inquiry" class="ghost" type="button" disabled/);
  assert.match(html,/function syncEmailSelectionState\(\)/);
  assert.match(html,/button\.classList\.toggle\("primary",count>0\)/);
  assert.match(html,/button\.classList\.toggle\("ghost",count===0\)/);
  assert.match(html,/button\.disabled=count===0/);
  assert.match(html,/checkbox\.onchange=.*syncEmailSelectionState\(\)/);
});
