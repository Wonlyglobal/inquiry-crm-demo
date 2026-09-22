import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql=fs.readFileSync(new URL("../supabase/migrations/20260922180000_operations_admin_and_data_health_monitor.sql",import.meta.url),"utf8");

test("operations admin migration targets the approved production profile",()=>{
  assert.match(sql,/c43bd3c2-6e3a-4228-99c7-dc95f33643f2/);
  assert.match(sql,/lower\(p\.email\)='chloelee@wonlyglobal\.com'/);
  assert.match(sql,/set role='owner',team='运营部',job_title='运营经理'/);
  assert.match(sql,/operations_admin_access_granted/);
});

test("test and invalid inquiry isolation is guarded",()=>{
  assert.match(sql,/isolated_before<>51/);
  assert.match(sql,/isolated_after<>isolated_before/);
  assert.match(sql,/excluded_from_dashboard/);
  assert.match(sql,/is_test_data/);
});

test("daily health snapshots are owner-only and do not contain customer content",()=>{
  assert.match(sql,/enable row level security/);
  assert.match(sql,/private\.current_crm_role\(\)='owner'/);
  assert.match(sql,/revoke all on public\.crm_data_health_snapshots from public,anon,authenticated/);
  assert.doesNotMatch(sql,/body_text|body_html|original_message|sender_email|recipient_emails/);
});

test("material drops open an auditable P1 risk case",()=>{
  assert.match(sql,/current_value\*100<prior_value\*80/);
  assert.match(sql,/security\.critical_data_count_drop/);
  assert.match(sql,/'p1'/);
  assert.match(sql,/capture-crm-data-health-daily/);
  assert.match(sql,/15 16 \* \* \*/);
});
