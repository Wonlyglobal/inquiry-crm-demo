import test from "node:test";
import assert from "node:assert/strict";
import { buildRedactedMailPayload, REDACTION_VERSION, restoreEvidenceQuote, redactGeneratedText } from "../supabase/functions/sales-email-body-analysis/redaction.mjs";

test("Bailian payload omits headers, truncates thread volume, and masks direct identifiers and money", () => {
  const messages = [{
    id: "internal-message-uuid",
    direction: "inbound",
    subject: "Sensitive subject is not sent",
    occurred_at: "2026-10-09T09:00:00Z",
    body_text: "Hello David, please quote USD 1,200 for Acme Trading. Contact me at david@example.com or +971 50 123 4567. See https://acme.example.com/spec.\nBest regards, David\n-----Original Message-----\nquoted secret",
  }];
  const payload = buildRedactedMailPayload(messages, ["David", "Acme Trading"]);
  assert.equal(payload.redaction_version, REDACTION_VERSION);
  assert.equal(payload.excerpts.length, 1);
  const excerpt = payload.excerpts[0];
  assert.equal(excerpt.message_id, "M1");
  assert.doesNotMatch(JSON.stringify(payload.excerpts), /internal-message-uuid|Sensitive subject|David|Acme Trading|david@example\.com|\+971|1,200|acme\.example\.com|quoted secret/);
  assert.match(excerpt.excerpt, /\[CONTACT_\d+\]/);
  assert.match(excerpt.excerpt, /\[EMAIL_\d+\]/);
  assert.match(excerpt.excerpt, /\[PHONE_\d+\]/);
  assert.match(excerpt.excerpt, /\[AMOUNT_\d+\]/);
  assert.match(excerpt.excerpt, /\[URL_\d+\]/);
});

test("evidence maps to exact local source text only when quote exists in the redacted excerpt", () => {
  const payload = buildRedactedMailPayload([{ id: "message-1", direction: "outbound", occurred_at: "2026-10-09", body_text: "Please email me at rep@wonlyglobal.com for the USD 500 quote." }]);
  const quote = payload.excerpts[0].excerpt;
  const restored = restoreEvidenceQuote("M1", quote, payload.mappings);
  assert.equal(restored.message_id, "message-1");
  assert.equal(restored.quote, "Please email me at rep@wonlyglobal.com for the USD 500 quote.");
  assert.equal(restoreEvidenceQuote("M1", "made up statement", payload.mappings), null);
  assert.equal(restoreEvidenceQuote("internal-uuid", quote, payload.mappings), null);
});

test("unselected long history is bounded and generated summaries do not expose mask tokens", () => {
  const messages = Array.from({ length: 12 }, (_, index) => ({
    id: `message-${index}`,
    direction: index % 2 ? "outbound" : "inbound",
    occurred_at: `2026-10-${String(index + 1).padStart(2, "0")}`,
    body_text: `Hello team, message ${index} ${"ordinary text ".repeat(100)}`,
  }));
  const payload = buildRedactedMailPayload(messages);
  assert.ok(payload.excerpts.length <= 6);
  assert.ok(payload.sent_char_count <= 4800);
  assert.ok(payload.excerpts.every((item) => item.excerpt.length <= 800));
  assert.equal(redactGeneratedText("客户 [CONTACT_1] 提到 [EMAIL_2]"), "客户 客户信息 提到 客户信息");
});
