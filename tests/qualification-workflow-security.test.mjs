import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915220000_secure_qualification_workflow.sql',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('./production-qualification-workflow-rollback.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('qualification fields are writable only through the role-aware workflow',()=>{
  assert.match(sql,/enforce_qualification_workflow/);
  assert.match(sql,/资格核验字段必须通过分角色的服务端流程修改/);
  assert.match(sql,/actor_role in \('owner','sales_manager','marketing'\)/);
  assert.match(sql,/actor_role in \('owner','sales_manager','sales'\)/);
  assert.match(sql,/业务员只能维护本人负责询盘/);
});

test('manager confirmation is durable and requires all qualification evidence',()=>{
  assert.match(sql,/qualification_manager_confirmed_at timestamptz/);
  assert.match(sql,/if actor_role in \('owner','sales_manager'\) and next_score=100/);
  assert.match(sql,/qualification_updated/);
  assert.match(html,/qualification_manager_confirmed_at/);
  assert.match(html,/save_inquiry_qualification/);
});

test('production qualification acceptance check is rollback-only',()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/DIRECT_QUALIFICATION_BYPASS_NOT_BLOCKED/);
  assert.match(rollback,/MANAGER_CONFIRMATION_NOT_RECORDED/);
  assert.match(rollback,/^rollback;/m);
});
