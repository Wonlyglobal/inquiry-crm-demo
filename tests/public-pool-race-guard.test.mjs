import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260910174000_public_pool_review_race_guard.sql',import.meta.url),'utf8');

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
