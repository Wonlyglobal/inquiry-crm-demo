import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20261013100000_daily_mailbox_activity_calendar.sql',import.meta.url),'utf8');

test('daily mailbox calendar aggregates personal Alibaba mailbox send and receive counts',()=>{
  assert.match(sql,/join public\.mailbox_connections b on b\.id=m\.mailbox_connection_id and b\.mailbox_kind='personal'/);
  assert.match(sql,/count\(\*\) filter\(where m\.direction='outbound'\).* as total_sent/s);
  assert.match(sql,/count\(\*\) filter\(where m\.direction='inbound'\).* as total_received/s);
  assert.match(sql,/'total_sent',d\.total_sent,'total_received',d\.total_received/);
});

test('daily mailbox calendar separates development mail, customer inbound and salesperson replies',()=>{
  assert.match(sql,/e\.action='outreach_email_sent'/);
  assert.match(sql,/e\.action='inquiry_reply_email_sent'/);
  assert.match(sql,/'development_sent',d\.development_sent,'customer_inbound',d\.customer_inbound,'reply_sent',d\.reply_sent/);
});

test('mailbox aggregate remains role scoped and does not return message content',()=>{
  assert.match(sql,/actor_role='sales_manager' and p\.team is not distinct from actor_team/);
  assert.match(sql,/actor_role='sales' and p\.id=actor/);
  assert.doesNotMatch(sql,/body_text|sender_email|recipient_emails|subject/);
  assert.match(sql,/revoke all on function public\.get_sales_email_activity_metrics\(date\) from public,anon/);
});
