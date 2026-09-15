import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915190000_structured_after_sales_cases.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-after-sales-case-workflow-rollback.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('after-sales cases are structured, owner-scoped and workflow-only',()=>{
  assert.match(sql,/create table if not exists public\.after_sales_cases/);
  assert.match(sql,/create policy after_sales_cases_read/);
  assert.match(sql,/private\.can_read_fulfillment/);
  assert.match(sql,/create or replace function public\.create_after_sales_case/);
  assert.match(sql,/create or replace function public\.update_after_sales_case/);
  assert.match(sql,/actor\.role='sales' and inquiry_owner<>actor\.id/);
  assert.match(sql,/for update of c/);
  assert.match(sql,/remaining=0[\s\S]*status='completed',after_sales_status='resolved'/);
  assert.match(sql,/仍有未解决售后工单，不能完成订单/);
  assert.match(sql,/grant select on public\.after_sales_cases to authenticated/);
});

test('after-sales UI exposes case creation, progress, resolution and history',()=>{
  assert.match(html,/async function openAfterSalesCaseCreate/);
  assert.match(html,/async function openAfterSalesCaseProgress/);
  assert.match(html,/supabase\.rpc\("create_after_sales_case"/);
  assert.match(html,/supabase\.rpc\("update_after_sales_case"/);
  assert.match(html,/售后工单/);
  assert.match(html,/data-after-sales-create/);
  assert.match(html,/data-after-sales-progress/);
});

test('production after-sales case acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/create_after_sales_case/);
  assert.match(rollbackSql,/UNRESOLVED_CASE_COMPLETION_NOT_BLOCKED/);
  assert.match(rollbackSql,/update_after_sales_case/);
  assert.match(rollbackSql,/^rollback;/m);
});
