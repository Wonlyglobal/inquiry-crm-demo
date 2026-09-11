import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260911065443_whatsapp_business_channel.sql", import.meta.url), "utf8");
const visibilityMigration = fs.readFileSync(new URL("../supabase/migrations/20260911080227_whatsapp_message_owner_visibility.sql", import.meta.url), "utf8");
const webhook = fs.readFileSync(new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url), "utf8");
const sender = fs.readFileSync(new URL("../supabase/functions/whatsapp-send/index.ts", import.meta.url), "utf8");
const connectionAdmin = fs.readFileSync(new URL("../supabase/functions/whatsapp-connection-admin/index.ts", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("WhatsApp channel stores only business-account identifiers and protects rows with RLS", () => {
  assert.match(migration, /create table if not exists public\.whatsapp_connections/);
  assert.match(migration, /provider text not null check \(provider in \('meta_cloud','official_bsp'\)\)/);
  assert.match(migration, /unique\(provider, phone_number_id\)/);
  assert.match(migration, /alter table public\.whatsapp_connections enable row level security/);
  assert.match(migration, /alter table public\.whatsapp_messages enable row level security/);
  assert.match(migration, /association_status text not null default 'pending'/);
  assert.match(migration, /grant all on public\.whatsapp_connections, public\.whatsapp_messages to service_role/);
  assert.doesNotMatch(migration, /(?:access[_ -]?token|app_secret|client_secret)\s+text/i);
});

test("WhatsApp message RLS lets the inquiry owner read manager-created channel messages", () => {
  assert.match(visibilityMigration, /drop policy if exists whatsapp_messages_read_visible/);
  assert.match(visibilityMigration, /i\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(visibilityMigration, /private\.current_crm_role\(\) in \('owner','sales_manager'\)/);
});

test("WhatsApp webhook requires Meta verification and HMAC signature", () => {
  assert.match(webhook, /WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
  assert.match(webhook, /x-hub-signature-256/);
  assert.match(webhook, /WHATSAPP_APP_SECRET/);
  assert.match(webhook, /Invalid webhook signature/);
  assert.match(webhook, /upsert\(/);
  assert.match(webhook, /whatsapp_messages/);
  assert.match(webhook, /async function matchInquiry/);
  assert.match(webhook, /association_method: match\.method/);
  assert.match(webhook, /association_status: match\.inquiryId \? "matched" : "pending"/);
  assert.doesNotMatch(webhook, /const normalized = text\(/);
  assert.match(webhook, /const normalized = textValue\(phone, 80\)/);
});

test("CRM exposes WhatsApp setup without claiming a personal account is connected", () => {
  assert.match(html, /data-view="whatsapp"/);
  assert.match(html, /whatsapp_connections/);
  assert.match(html, /等待数据库迁移/);
  assert.match(html, /已连接/);
  assert.match(html, /openWhatsAppMessages/);
  assert.match(html, /自动匹配当前有效询盘/);
  assert.match(html, /from\("whatsapp_messages"\)/);
  assert.match(html, /whatsapp_inquiry/);
  assert.match(html, /whatsapp-send-form/);
  assert.match(html, /functions\.invoke\("whatsapp-send"/);
  assert.match(html, /关联询盘（可选）/);
  assert.match(html, /inquiryOptions/);
  assert.match(html, /whatsappMessagesResult/);
  assert.match(html, /\[WhatsApp\]/);
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

test("WhatsApp connection setup verifies Meta before enabling a business channel", () => {
  assert.match(connectionAdmin, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(connectionAdmin, /WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
  assert.match(connectionAdmin, /WHATSAPP_APP_SECRET/);
  assert.match(connectionAdmin, /graph.facebook.com/);
  assert.match(connectionAdmin, /status: "connected"/);
  assert.match(connectionAdmin, /upsert\(/);
  assert.match(connectionAdmin, /whatsapp_connection_verified/);
  assert.match(connectionAdmin, /updated_by: user\.id/);
  assert.doesNotMatch(connectionAdmin, /localStorage|sessionStorage|document\.cookie/);
});
