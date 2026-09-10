import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/mailbox-connect/index.ts", import.meta.url), "utf8");

test("personal mailbox persistence does not use an unsupported partial-index conflict target", () => {
  assert.doesNotMatch(source, /onConflict:\s*["']user_id["']/);
  assert.match(source, /\.eq\(["']user_id["'],\s*userId\)/);
  assert.match(source, /\.eq\(["']mailbox_kind["'],\s*["']personal["']\)/);
  assert.match(source, /existing\s*\?\s*admin\.from\(["']mailbox_connections["']\)\.update/);
});

test("Ali mailbox 526 authentication failures are translated into actionable guidance", () => {
  assert.match(source, /526\\s\+Authentication failure/);
  assert.match(source, /客户端专用密码/);
  assert.match(source, /不要使用网页登录密码/);
});
