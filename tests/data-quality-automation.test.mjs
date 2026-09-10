import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sql=await readFile(new URL("../supabase/migrations/20260910144000_automatic_data_quality_refresh.sql",import.meta.url),"utf8");

test("all required quality checks are generated from authoritative fields",()=>{
  for(const key of ["missing_email","missing_country","missing_product","missing_quantity","missing_budget","missing_decision_maker","missing_next_followup","stagnant"])assert.match(sql,new RegExp(`'${key}'`));
  assert.match(sql,/qualification_role/);
  assert.match(sql,/interval '14 days'/);
});

test("quality reminders refresh on inquiry and contact changes",()=>{
  assert.match(sql,/create trigger inquiries_refresh_data_quality/);
  assert.match(sql,/create trigger contacts_refresh_data_quality/);
  assert.match(sql,/after insert or update of email,company_id or delete/);
});

test("daily scan refreshes time-based stagnation alerts",()=>{
  assert.match(sql,/create extension if not exists pg_cron/);
  assert.match(sql,/refresh-crm-data-quality-daily/);
  assert.match(sql,/private\.refresh_all_data_quality_alerts\(\)/);
});

test("browser refresh remains scoped to the authenticated active user",()=>{
  assert.match(sql,/actor_id uuid := auth\.uid\(\)/);
  assert.match(sql,/i\.owner_id=actor_id/);
  assert.match(sql,/revoke all on function private\.refresh_all_data_quality_alerts\(\) from public,anon,authenticated/);
});
