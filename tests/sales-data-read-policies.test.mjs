import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260911033612_tighten_sales_data_read_policies.sql", import.meta.url), "utf8");

test("sales communication policies follow inquiry ownership and manager visibility", () => {
  for (const policy of [
    "communication_summaries_read_visible",
    "email_messages_read_visible",
    "follow_ups_read",
    "quotation_versions_read",
  ]) {
    assert.match(sql, new RegExp(`drop policy if exists ${policy} on public\\.`));
    assert.match(sql, new RegExp(`create policy ${policy}`));
  }
  assert.match(sql, /i\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /private\.current_crm_role\(\) = any \(array\['owner'::crm_role,'sales_manager'::crm_role,'marketing'::crm_role\]\)/);
  assert.match(sql, /email_messages\.inquiry_id is null/);
  assert.doesNotMatch(sql, /using \(\s*exists \(\s*select 1 from public\.inquiries i\s*where i\.id = (?:communication_summaries\.inquiry_id|email_messages\.inquiry_id|follow_ups\.inquiry_id|quotation_versions\.inquiry_id)\s*\)\s*\)/s);
});
