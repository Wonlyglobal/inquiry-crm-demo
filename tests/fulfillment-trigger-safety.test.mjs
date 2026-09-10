import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../supabase/migrations/20260910211000_fix_fulfillment_update_trigger.sql",import.meta.url),"utf8");

test("fulfillment update trigger isolates table-specific record fields",()=>{
  assert.match(sql,/if tg_table_name in \('sample_shipments','sales_orders'\) then[\s\S]*if new\.inquiry_id/);
  assert.match(sql,/elsif tg_table_name='order_payments' then[\s\S]*new\.order_id/);
  assert.doesNotMatch(sql,/if tg_table_name in \('sample_shipments','sales_orders'\)[\s\S]*and new\.order_id/);
});
