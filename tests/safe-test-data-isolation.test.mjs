import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20260921123000_safe_test_data_isolation.sql',import.meta.url),'utf8');

test('test-data classification is explicit and protected server-side',()=>{
  for(const table of ['profiles','companies','contacts','inquiries']){
    assert.match(migration,new RegExp(`alter table public\\.${table}[\\s\\S]*?is_test_data boolean not null default false`));
    assert.match(migration,new RegExp(`${table}_test_data_isolation_select`));
    assert.match(migration,new RegExp(`${table}_guard_test_data_classification`));
  }
  assert.match(migration,/as restrictive/);
  assert.match(migration,/测试数据分类只能由受控生产迁移或服务端流程维护/);
  assert.match(migration,/inquiries_test_data_excluded_check/);
});

test('migration fails closed around the exact audited acceptance fixture',()=>{
  assert.match(migration,/010ed7a4-3624-43cc-87f7-fe51655de257/);
  assert.match(migration,/b175fd07-3e21-4060-aeda-e3c869c11847/);
  assert.match(migration,/crm-e2e@wangligroup\.com/);
  assert.match(migration,/inquiry_no=80/);
  assert.match(migration,/验收公司已被其他询盘使用，拒绝自动隔离/);
  assert.match(migration,/验收风险案件状态已变化，拒绝自动关闭/);
});

test('quarantine preserves evidence while removing operational pollution',()=>{
  assert.match(migration,/set active=false,is_test_data=true,data_environment='test'/);
  assert.match(migration,/excluded_from_dashboard=true/);
  assert.match(migration,/set resolved_at=coalesce\(resolved_at,clock_timestamp\(\)\)/);
  assert.match(migration,/set status='dismissed'/);
  assert.match(migration,/set read_at=coalesce\(read_at,clock_timestamp\(\)\)/);
  assert.match(migration,/set status='false_positive'/);
  assert.match(migration,/insert into public\.risk_case_events/);
  assert.match(migration,/insert into public\.audit_logs/);
  assert.doesNotMatch(migration,/delete\s+from/i);
});

test('ordinary roles cannot see quarantined core rows through direct API policies',()=>{
  assert.match(migration,/not is_test_data or id=\(select auth\.uid\(\)\) or private\.current_crm_role\(\)='owner'/);
  for(const table of ['companies','contacts','inquiries']){
    assert.match(migration,new RegExp(`create policy ${table}_test_data_isolation_select[\\s\\S]*?not is_test_data or private\\.current_crm_role\\(\\)='owner'`));
  }
});
