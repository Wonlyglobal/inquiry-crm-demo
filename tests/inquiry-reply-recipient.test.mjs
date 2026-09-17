import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("direct inquiry replies trust the authenticated inbound sender", () => {
  assert.match(
    html,
    /const intakeSender = String\(currentInquiry\?\.email_intake\?\.sender_email \|\| ""\)\.trim\(\)\.toLowerCase\(\);/,
  );
  assert.match(html, /if \(isValidEmail\(intakeSender\)\) return intakeSender;/);
});

test("inferred reply addresses still exclude WONLY-owned domains", () => {
  assert.match(
    html,
    /isValidEmail\(email\) && !\/@\(\?:wonlyglobal\|wonlygroup\)\\\.\(\?:com\|net\)\$\/i\.test\(email\)/,
  );
});
