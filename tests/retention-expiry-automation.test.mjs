import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915130000_automatic_retention_expiry_notifications.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-retention-expiry-rollback.sql',import.meta.url),'utf8');

test('retention reminders run daily without requiring a CRM page visit',()=>{
  assert.match(sql,/create or replace function private\.process_retention_expiry_notifications\(\)/);
  assert.match(sql,/notify-crm-retention-expiry-daily/);
  assert.match(sql,/20 16 \* \* \*/);
  assert.match(sql,/select private\.process_retention_expiry_notifications\(\)/);
});

test('retention reminders use the Shanghai business date and exclude ineligible inquiries',()=>{
  assert.match(sql,/clock_timestamp\(\) at time zone 'Asia\/Shanghai'/);
  assert.match(sql,/coalesce\(i\.excluded_from_dashboard,false\)=false/);
  assert.match(sql,/i\.public_pool_entered_at is null/);
  assert.match(sql,/i\.status not in \('won','lost'\)/);
});

test('daily reminders reach the owner and every active manager exactly once',()=>{
  assert.match(sql,/select owner_profile\.id\s+union\s+select manager\.id/s);
  assert.match(sql,/manager\.role in \('owner','sales_manager'\)/);
  assert.match(sql,/n\.recipient_id=e\.recipient_id/);
  assert.match(sql,/\(n\.created_at at time zone 'Asia\/Shanghai'\)::date=local_date/);
  assert.match(sql,/revoke all on function private\.process_retention_expiry_notifications\(\) from public,anon,authenticated/);
});

test('production retention reminder acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/perform private\.process_retention_expiry_notifications\(\)/);
  assert.match(rollbackSql,/RETENTION_NOTIFICATIONS_MISSING/);
  assert.match(rollbackSql,/^rollback;/m);
});
