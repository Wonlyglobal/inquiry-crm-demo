import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("sidebar groups the primary navigation into clear information architecture",()=>{
  assert.match(html,/const sidebarNavigationGroups = \[/);
  for(const label of ["日常工作","线索与获客","客户与商机","沟通协作","产品与成交支持","数据与管理"]){
    assert.match(html,new RegExp(`label:\"${label}\"`));
  }
  assert.match(html,/initializeSidebarNavigation\(\)/);
  assert.match(html,/openSidebarGroupForView\(view\)/);
  assert.match(html,/syncSidebarGroupBadges\(\)/);
  assert.match(html,/group\.querySelectorAll\("\.nav-update-badge:not\(\.hidden\)"\)/);
  assert.doesNotMatch(html,/\$\$\("\.nav-update-badge:not\(\.hidden\)",group\)/);
});

import vm from 'node:vm';
import {leadWorkspaceRoute} from '../assets/lead-workspace-route.mjs';
test('each existing sidebar action has one group and all six groups agree in both entry pages',()=>{
  for(const name of ['index.html','grace.html']){
    const source=fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
    const groups=vm.runInNewContext(source.match(/const sidebarNavigationGroups = (\[[\s\S]*?\n      \]);/)[1]);
    assert.equal(groups.length,6);
    const slots=groups.flatMap(g=>g.views);
    assert.equal(new Set(slots).size,slots.length);
    const navs=[...source.matchAll(/class="nav(?: [^"]*)?" data-view="([^"]+)"/g)].map(m=>m[1]).filter(v=>v!=='sop');
    for(const view of navs)assert.equal(slots.filter(v=>v===view).length,1,view);
    assert.deepEqual(Array.from(groups[0].views),['sales-today','sales-lead-entry','daily','follow-calendar','weekly-customers']);
  }
});
test('new shortcuts retain the canonical workspace and precise anchors',()=>{
  assert.equal(leadWorkspaceRoute('sales-leads','sales').href,'sales-leads.html?embed=1#lead-dashboard');
  assert.equal(leadWorkspaceRoute('sales-lead-entry','sales').href,'sales-leads.html?embed=1#entry');
  assert.equal(leadWorkspaceRoute('weekly-customers','sales').href,'sales-leads.html?embed=1#weekly-customer');
  for(const role of ['owner','marketing','sales_manager'])assert.equal(leadWorkspaceRoute('sales-lead-entry',role),null);
  assert.equal(leadWorkspaceRoute('settings','sales'),null);
});
test('shortcut authorization derives from original workspace roles and entry remains sales only',()=>{
  const matrix=html.slice(html.indexOf('const roleViewAccess ='),html.indexOf('const sidebarNavigationGroups'));
  const fn=html.slice(html.indexOf('      function canAccessView('),html.indexOf('      function renderRoleGuideLive('));
  const check=vm.runInNewContext(matrix+fn+';canAccessView');
  for(const role of ['owner','marketing','sales_manager','sales','unknown']){
    assert.equal(check('weekly-customers',role),check('sales-leads',role));
    assert.equal(check('sales-lead-entry',role),role==='sales');
  }
});
