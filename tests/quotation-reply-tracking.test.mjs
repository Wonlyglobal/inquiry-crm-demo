import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sql=await readFile(new URL("../supabase/migrations/20260910150000_precise_quotation_reply_tracking.sql",import.meta.url),"utf8");

test("synced outbound quotation mail is linked by inquiry, time and quote number",()=>{
  assert.match(sql,/new\.direction<>'outbound'/);
  assert.match(sql,/q\.inquiry_id=new\.inquiry_id/);
  assert.match(sql,/q\.sent_at\+interval '24 hours'/);
  assert.match(sql,/ilike '%'\|\|q\.quote_no\|\|'%'/);
  assert.match(sql,/set sent_message_id=new\.id/);
});

test("customer reply requires an RFC thread relationship to the sent quotation",()=>{
  assert.match(sql,/join public\.email_messages sent_message on sent_message\.id=q\.sent_message_id/);
  assert.match(sql,/new\.in_reply_to=sent_message\.message_id/);
  assert.match(sql,/sent_message\.message_id=any\(coalesce\(new\.reference_ids/);
});

test("unrelated inbound mail cannot be treated as a quotation reply",()=>{
  assert.doesNotMatch(sql,/where inquiry_id=new\.inquiry_id and status='sent' and sent_at is not null and sent_at<=reply_time/);
  assert.match(sql,/if quote_id is null then return new/);
});

test("existing synchronized quotation messages are backfilled",()=>{
  assert.match(sql,/Backfill sent quotations/);
  assert.match(sql,/where q\.status='sent' and q\.sent_at is not null and q\.sent_message_id is null/);
});
