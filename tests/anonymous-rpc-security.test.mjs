import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260911021806_revoke_anon_email_triage_mutations.sql", import.meta.url), "utf8");

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
