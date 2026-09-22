import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("sidebar groups the primary navigation into clear information architecture",()=>{
  assert.match(html,/const sidebarNavigationGroups = \[/);
  for(const label of ["工作台","客户与商机","沟通协作","销售支持","管理治理"]){
    assert.match(html,new RegExp(`label:\"${label}\"`));
  }
  assert.match(html,/initializeSidebarNavigation\(\)/);
  assert.match(html,/openSidebarGroupForView\(view\)/);
  assert.match(html,/syncSidebarGroupBadges\(\)/);
});
