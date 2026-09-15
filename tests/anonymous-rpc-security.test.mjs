import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260911021806_revoke_anon_email_triage_mutations.sql", import.meta.url), "utf8");
const privateSql = await readFile(new URL("../supabase/migrations/20260915103000_restrict_private_maintenance_functions.sql", import.meta.url), "utf8");

test("anonymous users cannot invoke email triage or maintenance mutations", () => {
  for (const signature of [
    "convert_email_intakes_to_inquiries(uuid[])",
    "delete_trashed_email_intakes(uuid[])",
    "restore_email_intakes(uuid[])",
    "trash_email_intakes(uuid[])",
    "triage_email_intakes(uuid[], text)",
  ]) {
    const escaped = signature.replace(/[()[\]]/g, "\\$&");
    assert.match(sql, new RegExp(`revoke all on function public\\.${escaped} from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`));
  }
  assert.match(sql, /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant execute on function public\.rls_auto_enable\(\) to authenticated;/);
});

test("browser roles cannot directly invoke private trigger or scheduler functions", () => {
  for (const signature of [
    "enforce_inquiry_update_scope()",
    "sync_email_reply_reminder()",
    "sync_email_reply_reminder_owner()",
    "notify_overdue_email_replies()",
  ]) {
    const escaped = signature.replace(/[()[\]]/g, "\\$&");
    assert.match(privateSql, new RegExp(`revoke all on function private\\.${escaped}\\s+from public, anon, authenticated;`));
  }
  assert.match(privateSql, /grant execute on function private\.notify_overdue_email_replies\(\)\s+to service_role;/);
});
