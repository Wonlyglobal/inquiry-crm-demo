import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [handler,worker,queueMigration,scheduleMigration]=await Promise.all([
  readFile(new URL('../supabase/functions/mail-sync-worker/index.ts',import.meta.url),'utf8'),
  readFile(new URL('../mail-sync/src/index.mjs',import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20261020120000_manual_shared_mailbox_sync.sql',import.meta.url),'utf8'),
  readFile(new URL('../supabase/migrations/20261020130000_schedule_edge_mail_sync.sql',import.meta.url),'utf8'),
]);

test('Edge mail worker fails closed before touching the mailbox and returns aggregate-only status',()=>{
  assert.match(handler,/request\.method\s*!==\s*"POST"/);
  assert.match(handler,/request\.headers\.get\("x-mail-sync-token"\)\s*!==\s*workerToken/);
  assert.ok(handler.indexOf('x-mail-sync-token')<handler.indexOf('runEdgeCycle()'));
  assert.match(handler,/json\(\{\s*ok:\s*true,\s*\.\.\.result\s*\}/);
  assert.doesNotMatch(handler,/request\.text\(|request\.json\(|body_text|sender_email|recipient_email/);
});

test('Edge cycle is leased, bounded, and does not trigger external mail AI',()=>{
  assert.match(worker,/runWithEdgeWorkerLease\(/);
  assert.match(worker,/deadline=Date\.now\(\)\+105_000/);
  assert.match(worker,/maxMessagesPerFolder:manual\?60:30/);
  assert.match(worker,/triggerAi:!edge/);
  assert.match(worker,/if\(!triggerAi\)return/);
});

test('manual queue and worker lease are service restricted and cron keeps its token in Vault',()=>{
  assert.match(queueMigration,/create table if not exists public\.mail_sync_manual_requests/);
  assert.match(queueMigration,/using \(requested_by=\(select auth\.uid\(\)\)\)/);
  assert.match(queueMigration,/auth\.role\(\).*service_role/s);
  assert.match(queueMigration,/vault\.create_secret\(/);
  assert.match(scheduleMigration,/\* \* \* \* \*/);
  assert.match(scheduleMigration,/vault\.decrypted_secrets/);
  assert.match(scheduleMigration,/x-mail-sync-token/);
  assert.match(scheduleMigration,/name='mail_sync_public_api_key'/);
  assert.doesNotMatch(scheduleMigration,/SUPABASE_SERVICE_ROLE_KEY|service_role|sb_publishable_/);
});
