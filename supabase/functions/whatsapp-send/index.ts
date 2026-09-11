import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Content-Type": "application/json" };
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

Deno.serve(async (req) => {
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
    if (!connectionId || !validPhone(recipient) || !body) return json({ error: "通道、E.164 格式收件号码和消息正文均为必填" }, 400);
    const { data: connection, error: connectionError } = await admin.from("whatsapp_connections").select("id,phone_number_id,status,created_by").eq("id", connectionId).single();
    if (connectionError || !connection || connection.status !== "connected") return json({ error: "WhatsApp Business 通道尚未连接" }, 400);
    if (caller.role === "sales" && connection.created_by !== user.id) return json({ error: "只能使用本人负责的 WhatsApp 通道" }, 403);
    if (inquiryId) {
      const { data: inquiry, error: inquiryError } = await userClient.from("inquiries").select("id,owner_id").eq("id", inquiryId).single();
      if (inquiryError || !inquiry) return json({ error: "无权访问关联询盘" }, 403);
      if (caller.role === "sales" && inquiry.owner_id !== user.id) return json({ error: "只能向本人负责询盘的客户发送消息" }, 403);
    }
    const graphResponse = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(connection.phone_number_id)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "text", text: { preview_url: false, body } }),
      signal: AbortSignal.timeout(20000),
    });
    const graphPayload = await graphResponse.json().catch(() => ({}));
    if (!graphResponse.ok) {
      await admin.from("whatsapp_connections").update({ status: "error", last_error: text(graphPayload?.error?.message || "WhatsApp API 发送失败", 1200), updated_at: new Date().toISOString() }).eq("id", connection.id);
      return json({ error: text(graphPayload?.error?.message || "WhatsApp API 发送失败", 500) }, 502);
    }
    const externalId = text(graphPayload?.messages?.[0]?.id, 200) || null;
    const sentAt = new Date().toISOString();
    const { data: saved, error: saveError } = await admin.from("whatsapp_messages").insert({ connection_id: connection.id, external_message_id: externalId, direction: "outbound", recipient_phone: recipient, message_type: "text", body_text: body, inquiry_id: inquiryId, delivery_status: "queued", occurred_at: sentAt, raw_payload: graphPayload }).select("id,external_message_id,delivery_status,occurred_at").single();
    if (saveError) throw new Error("消息已提交 WhatsApp，但 CRM 记录失败：" + saveError.message);
    await admin.from("whatsapp_connections").update({ last_sent_at: sentAt, last_error: null, updated_at: sentAt }).eq("id", connection.id);
    return json({ sent: true, message: saved });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "WhatsApp 发送失败" }, 400);
  }
});
