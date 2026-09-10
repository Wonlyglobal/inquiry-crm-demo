import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260910193000_harden_quotation_creation.sql", import.meta.url), "utf8");

test("quotation version allocation is serialized on the inquiry row", () => {
  assert.match(sql, /from public\.inquiries[\s\S]*for update/i);
  assert.match(sql, /max\(version_no\)[\s\S]*where inquiry_id=target_inquiry_id/i);
});

test("quotation lines and currency are validated server-side", () => {
  assert.match(sql, /币种必须使用三位大写代码/);
  assert.match(sql, /每项报价必须填写产品或型号/);
  assert.match(sql, /每项报价数量必须大于 0/);
  assert.match(sql, /每项报价单价不能小于 0/);
});

test("quotation creation remains owner-scoped and audited", () => {
  assert.match(sql, /i\.owner_id=actor or actor_role in \('owner','sales_manager'\)/);
  assert.match(sql, /'quotation_created'/);
  assert.match(sql, /grant execute[\s\S]*to authenticated/i);
});
