import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20260915133000_complete_notification_inbox.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-notification-inbox-rollback.sql',import.meta.url),'utf8');

test('notification inbox paginates every accessible notification',()=>{
  const start=html.indexOf('async function loadNotificationsUnsafe()');
  const end=html.indexOf('function renderNotifications()',start);
  assert.ok(start>0&&end>start);
  const source=html.slice(start,end);
  assert.match(source,/loadModuleRowsPaged\(\(from,to\)=>supabase/);
  assert.match(source,/\.range\(from,to\)/);
  assert.doesNotMatch(source,/\.limit\(30\)/);
});

test('mark-all uses one recipient-scoped server operation',()=>{
  assert.match(html,/supabase\.rpc\("mark_my_notifications_read"\)/);
  assert.doesNotMatch(html,/from\("notifications"\)\.update\(\{read_at:readAt\}\)\.in\("id",unreadIds\)/);
  assert.match(sql,/where recipient_id=actor_id and read_at is null/);
  assert.match(sql,/get diagnostics updated_count=row_count/);
});

test('notification batch update is authenticated and indexed',()=>{
  assert.match(sql,/notifications_recipient_unread_created_idx/);
  assert.match(sql,/where read_at is null/);
  assert.match(sql,/p\.id=actor_id and p\.active=true/);
  assert.match(sql,/revoke all on function public\.mark_my_notifications_read\(\) from public,anon/);
  assert.match(sql,/grant execute on function public\.mark_my_notifications_read\(\) to authenticated/);
});

test('production notification acceptance check is isolated and rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/perform set_config\('request\.jwt\.claim\.sub'/);
  assert.match(rollbackSql,/OTHER_RECIPIENT_NOTIFICATION_CHANGED/);
  assert.match(rollbackSql,/^rollback;/m);
});
