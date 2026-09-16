import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260911065443_whatsapp_business_channel.sql", import.meta.url), "utf8");
const visibilityMigration = fs.readFileSync(new URL("../supabase/migrations/20260911080227_whatsapp_message_owner_visibility.sql", import.meta.url), "utf8");
const webhook = fs.readFileSync(new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url), "utf8");
const sender = fs.readFileSync(new URL("../supabase/functions/whatsapp-send/index.ts", import.meta.url), "utf8");
const connectionAdmin = fs.readFileSync(new URL("../supabase/functions/whatsapp-connection-admin/index.ts", import.meta.url), "utf8");
const legacyCompatibility = fs.readFileSync(new URL("../supabase/migrations/20260914124500_whatsapp_legacy_message_compat.sql", import.meta.url), "utf8");
const realtimeWorkspace = fs.readFileSync(new URL("../supabase/migrations/20260914133000_whatsapp_realtime_workspace.sql", import.meta.url), "utf8");
const webhookSubscriptionStatus = fs.readFileSync(new URL("../supabase/migrations/20260914143500_whatsapp_webhook_subscription_status.sql", import.meta.url), "utf8");
const contactAvatars = fs.readFileSync(new URL("../supabase/migrations/20260914150000_contact_avatars.sql", import.meta.url), "utf8");
const bilingualTranslation = fs.readFileSync(new URL("../supabase/migrations/20260914154500_whatsapp_bilingual_translation.sql", import.meta.url), "utf8");
const contactEvidence = fs.readFileSync(new URL("../supabase/migrations/20260915203000_record_whatsapp_contact_evidence.sql", import.meta.url), "utf8");
const contactEvidenceRollback = fs.readFileSync(new URL("./production-whatsapp-contact-evidence-rollback.sql", import.meta.url), "utf8");
const translator = fs.readFileSync(new URL("../supabase/functions/whatsapp-translate/index.ts", import.meta.url), "utf8");
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
  assert.match(webhook, /message\.external_message_id\s*\?/);
  assert.match(webhook, /\.from\("whatsapp_messages"\)\.insert\(record\)/);
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

test("CRM provides a realtime WhatsApp-style conversation workspace", () => {
  assert.match(html, /id="whatsapp-workspace"/);
  assert.match(html, /class="wa-conversation/);
  assert.match(html, /id="wa-compose-form"/);
  assert.match(html, /function subscribeWhatsAppWorkspace/);
  assert.match(html, /postgres_changes/);
  assert.match(html, /event:"\*"/);
  assert.match(html, /table:"whatsapp_messages"/);
  assert.match(realtimeWorkspace, /replica identity full/);
  assert.match(realtimeWorkspace, /alter publication supabase_realtime add table public\.whatsapp_messages/);
  assert.match(html, /function waAvatarMarkup/);
  assert.match(html, /function uploadWhatsAppContactAvatar/);
  assert.match(html, /rpc\("set_customer_contact_avatar",\{target_contact_id:conversation\.contactId,avatar_path:path\}\)/);
  assert.doesNotMatch(html, /from\("contacts"\)\.update\(\{avatar_url:/);
  assert.match(contactAvatars, /add column if not exists avatar_url text/);
});

test("WhatsApp sender is server-side, owner-scoped and records the API result", () => {
  assert.match(sender, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(sender, /WHATSAPP_GRAPH_VERSION/);
  assert.match(sender, /Authorization: `Bearer \$\{graphToken\}`/);
  assert.match(sender, /\^\\\+\[1-9\]\\d\{7,14\}\$/);
  assert.match(sender, /只能使用本人负责的 WhatsApp 通道/);
  assert.match(sender, /whatsapp_messages/);
  assert.match(sender, /delivery_status: "queued"/);
  assert.match(sender, /Embedded Signup 共存模式/);
  assert.doesNotMatch(sender, /完成6位两步验证 PIN 注册/);
  assert.doesNotMatch(sender, /localStorage|sessionStorage|document\.cookie/);
});

test("successful WhatsApp sends obey contact policy and create protected follow-up evidence", () => {
  assert.match(sender, /check_inquiry_contact_allowed/);
  assert.match(sender, /record_inquiry_marketing_contact/);
  assert.match(sender, /sent_by: user\.id/);
  assert.match(sender, /record_sent_whatsapp_followup/);
  assert.match(html, /result\.data\?\.warnings\?\.length/);
  assert.match(contactEvidence, /add column if not exists sent_by uuid/);
  assert.match(contactEvidence, /add column if not exists whatsapp_message_id uuid/);
  assert.match(contactEvidence, /message_row\.external_message_id is null/);
  assert.match(contactEvidence, /inquiry_row\.owner_id=message_row\.sent_by/);
  assert.match(contactEvidence, /set_config\('app\.inquiry_workflow_rpc','on',true\)/);
  assert.match(contactEvidence, /revoke all on function public\.record_sent_whatsapp_followup\(uuid\) from public,anon,authenticated/);
  assert.match(contactEvidence, /grant execute on function public\.record_sent_whatsapp_followup\(uuid\) to service_role/);
  assert.match(contactEvidenceRollback, /^begin;/m);
  assert.match(contactEvidenceRollback, /WHATSAPP_FOLLOWUP_NOT_IDEMPOTENT/);
  assert.match(contactEvidenceRollback, /^rollback;/m);
});

test("WhatsApp workspace sends the original text without automatic translation", () => {
  assert.match(bilingualTranslation, /add column if not exists translation_zh text/);
  assert.match(bilingualTranslation, /add column if not exists translation_en text/);
  assert.match(translator, /action!=="translate_messages"/);
  assert.match(translator, /action==="translate_text"/);
  assert.match(translator, /DEEPSEEK_API_KEY/);
  assert.match(translator, /userDb\.from\("whatsapp_messages"\)/);
  assert.doesNotMatch(html, /id="wa-translate-toggle"/);
  assert.doesNotMatch(html, /function translateWhatsAppWorkspaceMessages/);
  assert.doesNotMatch(html, /functions\.invoke\("whatsapp-translate"/);
  assert.match(html, /body,inquiry_id:whatsappWorkspaceState\.selectedInquiryId/);
  assert.match(sender, /translation_zh: translationZh/);
});

test("WhatsApp connection setup verifies Meta before enabling a business channel", () => {
  assert.match(connectionAdmin, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(connectionAdmin, /WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
  assert.match(connectionAdmin, /WHATSAPP_APP_SECRET/);
  assert.doesNotMatch(connectionAdmin, /WHATSAPP_REGISTRATION_PIN/);
  assert.doesNotMatch(connectionAdmin, /\/register/);
  assert.doesNotMatch(html, /register_phone:true/);
  assert.match(connectionAdmin, /graph.facebook.com/);
  assert.match(connectionAdmin, /status: "connected"/);
  assert.match(connectionAdmin, /upsert\(/);
  assert.match(connectionAdmin, /whatsapp_connection_verified/);
  assert.match(connectionAdmin, /updated_by: user\.id/);
  assert.match(connectionAdmin, /owner_id: user\.id/);
  assert.match(connectionAdmin, /display_phone: displayPhone/);
  assert.match(connectionAdmin, /connected_at: now/);
  assert.match(connectionAdmin, /function ensureWabaSubscription/);
  assert.match(connectionAdmin, /subscribed_apps/);
  assert.match(connectionAdmin, /action === "ensure_subscription"/);
  assert.match(html, /action:"ensure_subscription"/);
  assert.match(connectionAdmin, /webhook_verified_at: subscribedAt/);
  assert.match(html, /实时同步已开启/);
  assert.match(webhookSubscriptionStatus, /add column if not exists webhook_verified_at timestamptz/);
  assert.doesNotMatch(connectionAdmin, /localStorage|sessionStorage|document\.cookie/);
});

test("legacy WhatsApp tables are compatible with Cloud API workers", () => {
  assert.match(legacyCompatibility, /add column if not exists external_message_id text/);
  assert.match(legacyCompatibility, /add column if not exists association_status text not null default 'pending'/);
  assert.match(legacyCompatibility, /add column if not exists occurred_at timestamptz not null/);
  assert.match(legacyCompatibility, /whatsapp_messages_external_id_idx/);
  assert.match(legacyCompatibility, /grant select, insert, update on table public\.whatsapp_messages to service_role/);
});
