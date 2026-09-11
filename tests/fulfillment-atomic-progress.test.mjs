import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../supabase/migrations/20260910210000_atomic_fulfillment_progress.sql",import.meta.url),"utf8");
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");

test("order progress updates and event insertion are one transaction",()=>{
  assert.match(sql,/create or replace function public\.update_sales_order_progress/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/update public\.sales_orders[\s\S]*insert into public\.order_events/);
  assert.match(sql,/returns public\.sales_orders/);
});

test("frontend uses the atomic order progress RPC",()=>{
  assert.match(html,/supabase\.rpc\("update_sales_order_progress"/);
  assert.match(html,/progress_event_type:eventType/);
});

test("order progress handler is not executed during CRM startup",()=>{
  const matches=html.match(/\$\("#order-progress-form"\)\.onsubmit/g)||[];
  assert.equal(matches.length,2,"both handlers must be lazily bound inside the order progress flow");
  const functionStart=html.indexOf("async function openOrderProgress(order,inquiry)");
  const functionEnd=html.indexOf("async function openOrderPayment(order,inquiry)",functionStart);
  assert.ok(functionStart>=0&&functionEnd>functionStart);
  assert.equal((html.slice(functionStart,functionEnd).match(/\$\("#order-progress-form"\)\.onsubmit/g)||[]).length,2);
});
