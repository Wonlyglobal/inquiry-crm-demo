import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Arabic email reading and composing use right-to-left direction", () => {
  assert.match(html, /id="mail-compose-subject"[^>]+dir="auto"/);
  assert.match(html, /id="mail-compose-body"[^>]+dir="auto"/);
  assert.match(html, /replyingInArabic=\/\[\\u0600-\\u06ff/);
  assert.match(html, /field\.dir=rtl\?"rtl":"auto"/);
  assert.match(html, /class="email-detail-body" dir="auto"/);
  assert.match(html, /body\.dir="auto"/);
});
