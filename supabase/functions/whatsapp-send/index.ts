import { withReadOnlyGuard } from "../_shared/read-only.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function envKey(grouped: string, standard: string) {
  const groupedValue = Deno.env.get(grouped);
  if (groupedValue) {
    try { const parsed = JSON.parse(groupedValue); if (parsed.default) return parsed.default; } catch { /* legacy key */ }
  }
  return Deno.env.get(standard) || "";
}
function text(value: unknown, max = 50000) { return String(value || "").trim().slice(0, max); }
function validPhone(value: string) { return /^\+[1-9]\d{7,14}$/.test(value); }

Deno.serve(withReadOnlyGuard(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const service = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !publishable || !service) throw new Error("服务端密钥未配置");
    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "未登录" }, 401);
    const { data: caller, error: callerError } = await userClient.from("profiles").select("id,role,active").eq("id", user.id).single();
    if (callerError || !caller?.active || !["sales", "sales_manager", "owner"].includes(caller.role)) return json({ error: "当前账号无权发送 WhatsApp 消息" }, 403);
    const graphToken = text(Deno.env.get("WHATSAPP_ACCESS_TOKEN"), 4000);
    const graphVersion = text(Deno.env.get("WHATSAPP_GRAPH_VERSION"), 20);
    if (!graphToken || !graphVersion) throw new Error("WhatsApp Business API 尚未配置 Access Token 或 Graph API 版本");
    const input = await req.json();
    const connectionId = text(input.connection_id, 100);
    const recipient = text(input.to, 40);
    const body = text(input.body, 4096);
    const inquiryId = text(input.inquiry_id, 100) || null;
    const translationZh = text(input.translation_zh, 4096) || null;
    const translationEn = text(input.translation_en, 4096) || null;
    const detectedLanguage = text(input.detected_language, 80) || null;
    let messageKind = "standalone";
    if (!connectionId || !validPhone(recipient) || !body) return json({ error: "通道、E.164 格式收件号码和消息正文均为必填" }, 400);
    const { data: connection, error: connectionError } = await admin.from("whatsapp_connections").select("id,phone_number_id,status,created_by").eq("id", connectionId).single();
    if (connectionError || !connection || connection.status !== "connected") return json({ error: "WhatsApp Business 通道尚未连接" }, 400);
    if (caller.role === "sales" && connection.created_by !== user.id) return json({ error: "只能使用本人负责的 WhatsApp 通道" }, 403);
    if (inquiryId) {
      const { data: inquiry, error: inquiryError } = await userClient.from("inquiries").select("id,owner_id").eq("id", inquiryId).single();
      if (inquiryError || !inquiry) return json({ error: "无权访问关联询盘" }, 403);
      if (caller.role === "sales" && inquiry.owner_id !== user.id) return json({ error: "只能向本人负责询盘的客户发送消息" }, 403);
      const { data: latest, error: latestError } = await admin.from("whatsapp_messages").select("direction").eq("inquiry_id", inquiryId).order("occurred_at", { ascending: false }).limit(1).maybeSingle();
      if (latestError) throw latestError;
      messageKind = latest?.direction === "inbound" ? "reply" : "outreach";
      if (messageKind === "outreach") {
        const { data: policy, error: policyError } = await userClient.rpc("check_inquiry_contact_allowed", { target_inquiry_id: inquiryId });
        if (policyError) throw policyError;
        if (!policy?.allowed) return json({ error: `触达规则拦截：${text(policy?.reason, 500) || "当前不允许主动联系客户"}` }, 409);
      }
    }
    const graphResponse = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(connection.phone_number_id)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "text", text: { preview_url: false, body } }),
      signal: AbortSignal.timeout(20000),
    });
    const graphPayload = await graphResponse.json().catch(() => ({}));
    if (!graphResponse.ok) {
      const graphCode = Number(graphPayload?.error?.code || 0);
      const graphMessage = text(graphPayload?.error?.message || "WhatsApp API 发送失败", 1200);
      await admin.from("whatsapp_connections").update({ last_error: graphMessage, updated_at: new Date().toISOString() }).eq("id", connection.id);
      if (graphCode === 133010) return json({ error: "该号码尚未启用 Cloud API。若号码仍在 WhatsApp Business App 中，请通过 Meta/BSP 的 Embedded Signup 共存模式接入；否则请改用未绑定 Business App 的 Cloud API 专用号码。", code: graphCode }, 502);
      return json({ error: graphMessage, code: graphCode || null }, 502);
    }
    const externalId = text(graphPayload?.messages?.[0]?.id, 200) || null;
    const sentAt = new Date().toISOString();
    const { data: saved, error: saveError } = await admin.from("whatsapp_messages").insert({ connection_id: connection.id, external_message_id: externalId, direction: "outbound", recipient_phone: recipient, message_type: "text", body_text: body, inquiry_id: inquiryId, sent_by: user.id, delivery_status: "queued", occurred_at: sentAt, raw_payload: graphPayload, translation_zh: translationZh, translation_en: translationEn, detected_language: detectedLanguage, translated_at: translationZh&&translationEn?sentAt:null }).select("id,external_message_id,delivery_status,occurred_at").single();
    if (saveError) throw new Error("消息已提交 WhatsApp，但 CRM 记录失败：" + saveError.message);
    const warnings: string[] = [];
    if (inquiryId) {
      const evidence = await admin.rpc("record_sent_whatsapp_followup", { target_whatsapp_message_id: saved.id });
      if (evidence.error) warnings.push(`跟进证据写入失败：${evidence.error.message}`);
      if (messageKind === "outreach") {
        const recorded = await userClient.rpc("record_inquiry_marketing_contact", { target_inquiry_id: inquiryId, contact_reason: "CRM WhatsApp 主动消息已发送" });
        if (recorded.error) warnings.push(`触达记录更新失败：${recorded.error.message}`);
      }
    }
    await admin.from("whatsapp_connections").update({ last_sent_at: sentAt, last_error: null, updated_at: sentAt }).eq("id", connection.id);
    return json({ sent: true, message: saved, message_kind: messageKind, warnings });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "WhatsApp 发送失败" }, 400);
  }
}));
