import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const feedbackFunction = await readFile(new URL('../supabase/functions/crm-ai-advisor-feedback/index.ts', import.meta.url), 'utf8');

test('AI advisor is available to every CRM business role', () => {
  for (const role of ['owner', 'sales_manager', 'marketing', 'sales']) {
    assert.match(html, new RegExp(`${role}: new Set\\(\\[[^\\]]*"ai-advisor"`));
  }
});

test('AI advisor exposes the six approved role-aware views', () => {
  for (const tab of ['today', 'marketing', 'sales', 'daily', 'weekly', 'outcomes']) {
    assert.match(html, new RegExp(`data-advisor-tab="${tab}"`));
  }
  assert.match(html, /advisorRoleCopy=\{owner:/);
  assert.match(html, /sales_manager:\["团队销售顾问"/);
  assert.match(html, /marketing:\["营销增长顾问"/);
  assert.match(html, /sales:\["个人销售顾问"/);
});

test('AI advisor keeps human approval and audit guardrails', () => {
  assert.match(html, /不自动发信、分配询盘、修改价格、判定有效\/无效、成交\/丢单/);
  assert.match(html, /data-advisor-feedback="accepted"/);
  assert.match(html, /data-advisor-feedback="modified"/);
  assert.match(html, /data-advisor-feedback="ignored"/);
  assert.match(html, /data-advisor-feedback="invalid"/);
  assert.match(html, /functions\.invoke\("crm-ai-advisor-feedback"/);
  assert.match(feedbackFunction, /action: "crm_advisor_feedback"/);
  assert.match(feedbackFunction, /if \(userError \|\| !user\)/);
  assert.match(feedbackFunction, /profileError \|\| !profile\?\.active/);
  assert.match(html, /switchView\(button\.dataset\.advisorAction\)/);
});

test('advice includes evidence, logic, benefit and risk fields', () => {
  for (const label of ['证据', '判断逻辑', '预期收益', '风险与缺口']) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /数据范围严格沿用当前账号权限/);
});
