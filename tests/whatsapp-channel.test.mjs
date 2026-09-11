import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260911065443_whatsapp_business_channel.sql", import.meta.url), "utf8");
const webhook = fs.readFileSync(new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url), "utf8");
const sender = fs.readFileSync(new URL("../supabase/functions/whatsapp-send/index.ts", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("WhatsApp channel stores only business-account identifiers and protects rows with RLS", () => {
  assert.match(migration, /create table if not exists public\.whatsapp_connections/);
  assert.match(migration, /provider text not null check \(provider in \('meta_cloud','official_bsp'\)\)/);
  assert.match(migration, /unique\(provider, phone_number_id\)/);
  assert.match(migration, /alter table public\.whatsapp_connections enable row level security/);
  assert.match(migration, /alter table public\.whatsapp_messages enable row level security/);
  assert.match(migration, /grant all on public\.whatsapp_connections, public\.whatsapp_messages to service_role/);
  assert.doesNotMatch(migration, /(?:access[_ -]?token|app_secret|client_secret)\s+text/i);
});

test("WhatsApp webhook requires Meta verification and HMAC signature", () => {
  assert.match(webhook, /WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
  assert.match(webhook, /x-hub-signature-256/);
  assert.match(webhook, /WHATSAPP_APP_SECRET/);
  assert.match(webhook, /Invalid webhook signature/);
  assert.match(webhook, /upsert\(/);
  assert.match(webhook, /whatsapp_messages/);
});

test("CRM exposes WhatsApp setup without claiming a personal account is connected", () => {
  assert.match(html, /data-view="whatsapp"/);
  assert.match(html, /当前状态：待配置/);
  assert.match(html, /个人 WhatsApp 不支持直接接入/);
  assert.match(html, /activeModuleView==="whatsapp"/);
});

test("WhatsApp sender is server-side, owner-scoped and records the API result", () => {
  assert.match(sender, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(sender, /WHATSAPP_GRAPH_VERSION/);
  assert.match(sender, /Authorization: `Bearer \$\{graphToken\}`/);
  assert.match(sender, /\^\\\+\[1-9\]\\d\{7,14\}\$/);
  assert.match(sender, /只能使用本人负责的 WhatsApp 通道/);
  assert.match(sender, /whatsapp_messages/);
  assert.match(sender, /delivery_status: "queued"/);
  assert.doesNotMatch(sender, /localStorage|sessionStorage|document\.cookie/);
});
