import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915213000_whatsapp_reply_reminders.sql',import.meta.url),'utf8');
const rollbackSql=fs.readFileSync(new URL('./production-whatsapp-reply-reminders-rollback.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('WhatsApp customer replies persist as owner-scoped work items',()=>{
  assert.match(sql,/create table if not exists public\.whatsapp_reply_reminders/);
  assert.match(sql,/inbound_message_id uuid not null unique references public\.whatsapp_messages/);
  assert.match(sql,/owner_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/grant select on public\.whatsapp_reply_reminders to authenticated/);
  assert.match(sql,/revoke all on function private\.sync_whatsapp_reply_reminder\(\) from public,anon,authenticated/);
});

test('inbound WhatsApp opens a reminder and an outbound reply closes it',()=>{
  assert.match(sql,/if new\.direction='inbound'/);
  assert.match(sql,/on conflict\(inbound_message_id\) do update/);
  assert.match(sql,/elsif new\.direction='outbound'/);
  assert.match(sql,/status='replied',replied_message_id=new\.id/);
  assert.match(sql,/sync_whatsapp_reply_reminder_on_message/);
  assert.match(sql,/sync_whatsapp_reply_reminder_owner_on_inquiry/);
});

test('overdue WhatsApp replies notify hourly and workbench combines both channels',()=>{
  assert.match(sql,/notify_overdue_whatsapp_replies/);
  assert.match(sql,/interval '24 hours'/);
  assert.match(sql,/notify-overdue-whatsapp-replies-hourly/);
  assert.match(html,/from\("whatsapp_reply_reminders"\)/);
  assert.match(html,/loadAllDashboardWhatsAppMessages\(\)/);
  assert.match(html,/replyChannel:latest\.get\(x\.id\)\.channel/);
  assert.match(html,/WhatsApp 客户有新回复/);
});

test('production WhatsApp reply acceptance check is rollback-only',()=>{
  assert.match(rollbackSql,/^begin;/m);
  assert.match(rollbackSql,/WHATSAPP_REPLY_REMINDER_NOT_OPENED/);
  assert.match(rollbackSql,/WHATSAPP_REPLY_REMINDER_NOT_CLOSED/);
  assert.match(rollbackSql,/^rollback;/m);
  assert.match(rollbackSql,/rollback_reminders=/);
});
