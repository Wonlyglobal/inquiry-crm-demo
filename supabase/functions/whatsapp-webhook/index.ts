import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-hub-signature-256, content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function envKey(grouped: string, standard: string) {
  const value = Deno.env.get(grouped);
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (parsed.default) return parsed.default;
    } catch { /* use the legacy key below */ }
  }
  return Deno.env.get(standard) || "";
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function verifySignature(body: string, signature: string, appSecret: string) {
  if (!signature.startsWith("sha256=") || !appSecret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = `sha256=${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  return safeEqual(signature.toLowerCase(), expected);
}

function textValue(value: unknown, max = 50000) {
  return String(value || "").trim().slice(0, max) || null;
}

function messageFromValue(value: Record<string, any>) {
  const type = textValue(value.type, 40) || "text";
  const payload = value[type] || {};
  return {
    external_message_id: textValue(value.id, 200),
    sender_phone: textValue(value.from, 80),
    message_type: type,
    body_text: type === "text" ? textValue(payload.body) : textValue(payload.caption),
    media_id: textValue(payload.id, 200),
    media_mime_type: textValue(payload.mime_type, 120),
    media_sha256: textValue(payload.sha256, 128),
    occurred_at: value.timestamp ? new Date(Number(value.timestamp) * 1000).toISOString() : new Date().toISOString(),
    raw_payload: value,
  };
}

async function matchInquiry(admin: any, phone: string) {
  const normalized = text(phone, 80);
  if (!normalized) return { inquiryId: null, method: null };
  const contactResults = await Promise.all([
    admin.from("contacts").select("id,company_id").eq("whatsapp", normalized).limit(5),
    admin.from("contacts").select("id,company_id").eq("phone", normalized).limit(5),
  ]);
  const companyIds = [...new Set(contactResults.flatMap((result: any) => result.data || []).map((contact: any) => contact.company_id).filter(Boolean))];
  for (const companyId of companyIds) {
    const inquiry = await admin.from("inquiries").select("id").eq("company_id", companyId).eq("validity", "valid").not("status", "in", "(won,lost)").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (inquiry.data?.id) return { inquiryId: inquiry.data.id, method: "contact_phone" };
  }
  return { inquiryId: null, method: null };
}

async function handleWebhook(req: Request) {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") || "";
    if (mode === "subscribe" && expected && token === expected && challenge) return new Response(challenge, { status: 200 });
    return json({ error: "Webhook verification failed" }, 403);
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.text();
  if (!(await verifySignature(body, req.headers.get("x-hub-signature-256") || "", Deno.env.get("WHATSAPP_APP_SECRET") || ""))) {
    return json({ error: "Invalid webhook signature" }, 401);
  }
  const urlValue = Deno.env.get("SUPABASE_URL") || "";
  const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!urlValue || !secret) return json({ error: "服务端密钥未配置" }, 500);
  const admin = createClient(urlValue, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let payload: any;
  try { payload = JSON.parse(body); } catch { return json({ error: "Invalid JSON" }, 400); }
  let stored = 0;
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change?.value || {};
      const phoneNumberId = textValue(value.metadata?.phone_number_id, 200);
      if (!phoneNumberId) continue;
      const connectionResult = await admin.from("whatsapp_connections").select("id").eq("phone_number_id", phoneNumberId).eq("status", "connected").maybeSingle();
      if (connectionResult.error || !connectionResult.data) continue;
      const connectionId = connectionResult.data.id;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const raw of messages) {
        const message = messageFromValue(raw);
        const match = await matchInquiry(admin, message.sender_phone || "");
        const result = await admin.from("whatsapp_messages").upsert({ ...message, connection_id: connectionId, direction: "inbound", inquiry_id: match.inquiryId, association_status: match.inquiryId ? "matched" : "pending", association_method: match.method, delivery_status: "received" }, { onConflict: "connection_id,external_message_id", ignoreDuplicates: true });
        if (!result.error) stored += 1;
      }
      if (messages.length) await admin.from("whatsapp_connections").update({ last_received_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null }).eq("id", connectionId);
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        await admin.from("whatsapp_messages").update({ delivery_status: textValue(status.status, 20) || "received" }).eq("connection_id", connectionId).eq("external_message_id", textValue(status.id, 200));
      }
    }
  }
  return json({ received: true, stored });
}

Deno.serve(async (req) => {
  try { return await handleWebhook(req); } catch (error) { return json({ error: error instanceof Error ? error.message : "Webhook processing failed" }, 500); }
});
