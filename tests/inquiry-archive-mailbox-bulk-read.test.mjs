import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, html, worker] = await Promise.all([
  readFile(new URL('../supabase/migrations/20261013110000_inquiry_archive_and_mailbox_bulk_read.sql', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../mail-sync/src/index.mjs', import.meta.url), 'utf8'),
]);

test('inquiry archive is owner-only, reversible, reasoned, and audited', () => {
  assert.match(migration, /private\.current_crm_role\(\) is distinct from 'owner'/);
  assert.match(migration, /create or replace function public\.archive_inquiry/);
  assert.match(migration, /create or replace function public\.restore_inquiry_from_archive/);
  assert.match(migration, /create or replace function public\.list_archived_inquiries/);
  assert.match(migration, /inquiry_archived/);
  assert.match(migration, /inquiry_restored/);
  assert.match(migration, /app\.inquiry_archive_rpc/);
  assert.match(migration, /archived_at is null and/);
  assert.match(migration, /create policy inquiries_not_archived on public\.inquiries as restrictive for all to public[\s\S]*using \(archived_at is null\) with check \(archived_at is null\)/);
  assert.match(html, /二次确认：将询盘/);
  assert.match(html, /不执行物理删除/);
  assert.match(html, /restore_inquiry_from_archive/);
});

test('CRM mailbox bulk-read is capped and limited to own personal inbound mail', () => {
  assert.match(migration, /cardinality\(target_message_ids\)>200/);
  assert.match(migration, /m\.direction='inbound'/);
  assert.match(migration, /mc\.user_id=actor and mc\.mailbox_kind='personal'/);
  assert.match(migration, /insert into public\.email_message_reads/);
  assert.match(migration, /email_message_read/);
  assert.match(html, /全选未读邮件（最多 200 封）/);
  assert.match(html, /mark_my_mailbox_messages_read/);
  assert.match(html, /不更改阿里邮箱原件/);
});

test('Ali Mail sent messages continue to produce CRM inquiry follow-up progress', () => {
  assert.match(worker, /selectSyncFolders\(boxes/);
  assert.match(worker, /direction:sent\?'outbound':'inbound'/);
  assert.match(worker, /async function applyMatchedMessage\(row, connection,\{triggerAi=true\}=\{\}\)/);
  assert.match(worker, /if\(row\?\.inquiry_id\)await applyMatchedMessage\(row,connection,\{triggerAi:!edge\}\)/);
  assert.match(worker, /if\(!triggerAi\)return/);
  assert.match(worker, /record_synced_email_followup/);
});
