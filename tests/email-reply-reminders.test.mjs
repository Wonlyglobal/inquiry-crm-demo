import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260910162000_persistent_email_reply_reminders.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('reply reminders are durable and scoped by owner or manager',()=>{
  assert.match(sql,/create table if not exists public\.email_reply_reminders/);
  assert.match(sql,/owner_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/role in \('owner','sales_manager'\)/);
});

test('inbound mail opens one reminder and outbound thread mail closes it',()=>{
  assert.match(sql,/new\.direction='inbound'/);
  assert.match(sql,/on conflict\(inbound_message_id\)/);
  assert.match(sql,/new\.direction='outbound'/);
  assert.match(sql,/status='replied'/);
  assert.match(sql,/new\.in_reply_to=inbound\.message_id/);
});

test('24 hour reminders are generated once by an hourly background job',()=>{
  assert.match(sql,/received_at<=clock_timestamp\(\)-interval '24 hours'/);
  assert.match(sql,/overdue_notified_at is null/);
  assert.match(sql,/notify-overdue-email-replies-hourly/);
});

test('ownership transfer and closed inquiries cannot leave orphan reminders',()=>{
  assert.match(sql,/sync_email_reply_reminder_owner_on_inquiry/);
  assert.match(sql,/set owner_id=new\.owner_id/);
  assert.match(sql,/new\.status in \('won','lost'\)/);
  assert.match(sql,/set status='dismissed'/);
  assert.match(sql,/from ranked r where r\.position=1 and r\.direction='inbound'/);
});

test('dashboard loads persisted reminders',()=>{
  assert.match(html,/email_reply_reminders/);
  assert.match(html,/dashboardState\.replyReminders/);
});
