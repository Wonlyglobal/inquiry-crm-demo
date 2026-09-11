import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/mailbox-connect/index.ts", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

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

test("an already connected salesperson mailbox disables the connection entry", () => {
  assert.match(html, /function refreshPersonalMailboxEntry/);
  assert.match(html, /button\.disabled=connected/);
  assert.match(html, /button\.textContent=connected\?"邮箱已连接":"连接我的邮箱"/);
  assert.match(html, /await refreshPersonalMailboxEntry\(\)/);
});

test("personal mailbox reads all messages with bounded pagination", () => {
  assert.match(html, /async function loadAllMailboxMessages\(connectionId\)/);
  assert.match(html, /\.eq\("mailbox_connection_id", connectionId\).*\.range\(from, from \+ pageSize - 1\)/s);
  assert.match(html, /loadAllMailboxMessages\(connection\.id\)/);
  assert.match(html, /async function loadAllMailboxReads\(userId\)/);
  assert.match(html, /async function loadAllOpenReplyReminders\(userId\)/);
  assert.match(html, /loadAllMailboxReads\(profile\.id\)/);
  assert.match(html, /loadAllOpenReplyReminders\(profile\.id\)/);
});
