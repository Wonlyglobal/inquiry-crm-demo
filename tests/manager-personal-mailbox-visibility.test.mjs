import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260922170000_preserve_manager_personal_mailbox_visibility.sql", import.meta.url), "utf8");

test("sales managers retain private access to messages from their own personal mailbox", () => {
  assert.match(migration, /drop policy if exists crm_manager_scope on public\.email_messages/i);
  assert.match(migration, /create policy crm_manager_scope on public\.email_messages[\s\S]*as restrictive/i);
  assert.match(migration, /mc\.id\s*=\s*email_messages\.mailbox_connection_id/i);
  assert.match(migration, /mc\.mailbox_kind\s*=\s*'personal'/i);
  assert.match(migration, /mc\.user_id\s*=\s*\(select auth\.uid\(\)\)/i);
});

test("manager team visibility still requires the approved inquiry scope", () => {
  assert.match(migration, /private\.crm_manager_covers_inquiry\(\(select auth\.uid\(\)\),\s*inquiry_id\)/i);
  assert.doesNotMatch(migration, /inquiry_id\s+is\s+null\s*\)/i);
});
