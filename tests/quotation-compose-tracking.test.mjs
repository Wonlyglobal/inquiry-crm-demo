import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("quotation email tracking uses the message id returned by the send function", () => {
  assert.match(html, /data\?\.message_id\|\|data\?\.email_message_id\|\|null/);
  assert.match(html, /mark_quotation_sent/);
});

