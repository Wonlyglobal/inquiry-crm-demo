import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const sender = await readFile(new URL("../supabase/functions/mailbox-compose-send/index.ts", import.meta.url), "utf8");

test("quotation email tracking is delegated to the server", () => {
  assert.match(html, /quotation_id:\$\("#mail-compose-quotation"\)\.value\|\|null/);
  assert.doesNotMatch(html, /target_message_id:data\?\.message_id/);
});

test("immediate quotation send is validated and finalized server-side without treating the SMTP id as a UUID", () => {
  assert.match(sender, /quotationId=clean\(input\.quotation_id/);
  assert.match(sender, /quote\.status!=="approved"/);
  assert.match(sender, /target_message_id:null/);
  assert.match(sender, /quotation_recorded:quotationRecorded/);
  assert.match(sender, /warnings/);
  assert.match(sender, /email_intake"\)\.select\("sender_email"\)/);
  assert.match(sender, /报价必须发送到该询盘登记的客户邮箱/);
  assert.doesNotMatch(sender, /quote\.created_by!==user\.id/);
});

test("general inquiry composer cannot bypass proactive contact suppression", () => {
  assert.match(sender, /email_messages"\)\.select\("direction"\)/);
  assert.match(sender, /messageKind=!latest\|\|latest\.direction==="inbound"\?"reply":"outreach"/);
  assert.match(sender, /check_inquiry_contact_allowed/);
  assert.match(sender, /record_inquiry_marketing_contact/);
});
