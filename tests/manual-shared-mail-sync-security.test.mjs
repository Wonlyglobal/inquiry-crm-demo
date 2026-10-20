import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20261020120000_manual_shared_mailbox_sync.sql',import.meta.url),'utf8');
const worker=await readFile(new URL('../mail-sync/src/manual-sync.mjs',import.meta.url),'utf8');
const page=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('manual pull can only be requested by active mailbox-triage roles',()=>{
  assert.match(migration,/p\.active=true/);
  assert.match(migration,/coalesce\(private\.current_crm_role\(\)::text,''\) not in \('owner','marketing'\)/);
  assert.match(migration,/mailbox_kind='shared_inquiry' and c\.status='connected' and c\.sync_enabled=true/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/requested_at>clock_timestamp\(\)-interval '30 seconds'/);
});

test('users can read only own request state and cannot mutate the queue',()=>{
  assert.match(migration,/alter table public\.mail_sync_manual_requests enable row level security/i);
  assert.match(migration,/revoke insert,update,delete on public\.mail_sync_manual_requests from authenticated/i);
  assert.match(migration,/using \(requested_by=\(select auth\.uid\(\)\)\)/);
  assert.match(migration,/claim_shared_mail_sync_request\(\)[\s\S]*?coalesce\(auth\.role\(\),''\)<>'service_role'/i);
  assert.match(migration,/grant execute on function public\.claim_shared_mail_sync_request\(\) to service_role/i);
});

test('worker processes only shared mailbox requests and exposes generic status codes',()=>{
  assert.match(worker,/eq\('mailbox_kind','shared_inquiry'\)/);
  assert.match(worker,/eq\('sync_enabled',true\)/);
  assert.match(worker,/target_result_code:resultCode/);
  assert.match(worker,/mailbox_unavailable/);
  assert.match(worker,/公共邮箱手动同步失败，请检查邮箱连接与同步服务状态/);
  assert.doesNotMatch(worker,/target_result_code:String\(error/);
});

test('triage page separates list refresh from manual mailbox pull and polls only own request',()=>{
  assert.match(page,/id="email-sync-now"[^>]*>手动拉取公共邮箱/);
  assert.match(page,/rpc\("request_shared_mail_sync"\)/);
  assert.match(page,/from\("mail_sync_manual_requests"\)\.select\("status,result_code"\)/);
  assert.match(page,/不會修改阿里邮箱原件|不会修改阿里邮箱原件/);
});
