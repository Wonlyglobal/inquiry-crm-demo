import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260910174000_public_pool_review_race_guard.sql',import.meta.url),'utf8');
const retentionSql=fs.readFileSync(new URL('../supabase/migrations/20260915123000_harden_retention_public_pool_integrity.sql',import.meta.url),'utf8');
const productionRollback=fs.readFileSync(new URL('./production-retention-public-pool-rollback.sql',import.meta.url),'utf8');

test('public-pool approval rechecks customer ownership under a row lock',()=>{
  assert.match(sql,/from public\.inquiries where id=request_inquiry_id for update/);
  assert.match(sql,/该客户已被领取，当前申请不能再批准/);
  assert.match(sql,/客户负责人已变化，当前释放申请不能再批准/);
});

test('winning claim closes and notifies all competing applications',()=>{
  assert.match(sql,/set status='cancelled'/);
  assert.match(sql,/id<>req\.id/);
  assert.match(sql,/public_pool_request_cancelled/);
  assert.match(sql,/该客户已由其他申请人领取/);
});

test('ownership, retention and public-pool fields require audited workflows',()=>{
  assert.match(retentionSql,/before update of owner_id,retained_until,public_pool_entered_at/);
  assert.match(retentionSql,/current_setting\('app\.inquiry_workflow_rpc',true\)/);
  assert.match(retentionSql,/负责人、客户保留期限和公海状态必须通过对应审批流程修改/);
  assert.match(retentionSql,/revoke all on function private\.enforce_inquiry_assignment_and_retention_workflow\(\) from public,anon,authenticated/);
});

test('retention approval locks consistently and rejects stale requests',()=>{
  const inquiryLock=retentionSql.indexOf('from public.inquiries where id=request_inquiry_id for update');
  const requestLock=retentionSql.indexOf('from public.inquiry_retention_requests where id=target_request_id for update');
  assert.ok(inquiryLock>0&&requestLock>inquiryLock);
  assert.match(retentionSql,/商机已关闭或不再有效，不能批准保留申请/);
  assert.match(retentionSql,/询盘负责人或公海状态已变化/);
  assert.match(retentionSql,/申请的保留截止日期已过/);
  assert.match(retentionSql,/p\.id=req\.requested_by and p\.role='sales' and p\.active/);
});

test('production retention and public-pool acceptance check is rollback-only',()=>{
  assert.match(productionRollback,/^begin;/m);
  assert.match(productionRollback,/set retained_until=current_date\+30/);
  assert.match(productionRollback,/set owner_id=null,public_pool_entered_at=clock_timestamp\(\)/);
  assert.match(productionRollback,/^rollback;/m);
});
