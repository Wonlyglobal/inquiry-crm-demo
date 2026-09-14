import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const text = (value: unknown, max = 200) => String(value || "").trim().slice(0, max);
function envKey(grouped: string, standard: string) { const value = Deno.env.get(grouped); if (value) { try { const parsed = JSON.parse(value); if (parsed.default) return parsed.default; } catch {} } return Deno.env.get(standard) || ""; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL") || "", publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), service = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !publishable || !service) return json({ error: "服务端密钥未配置" }, 500);
    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "未登录" }, 401);
    const { data: caller, error: callerError } = await userClient.from("profiles").select("id,role,active").eq("id", user.id).single();
    if (callerError || !caller?.active || !["owner", "sales_manager"].includes(caller.role)) return json({ error: "只有主管或管理员可以配置 WhatsApp Business" }, 403);
    const input = await req.json();
    const provider = text(input.provider, 30), businessAccountId = text(input.business_account_id, 120); let phoneNumberId = text(input.phone_number_id, 120); const displayPhone = text(input.display_phone_number, 40), displayName = text(input.display_name, 120) || null;
    if (!["meta_cloud", "official_bsp"].includes(provider) || !businessAccountId || !phoneNumberId || !/^\+[1-9]\d{7,14}$/.test(displayPhone)) return json({ error: "接入方式、Business Account ID、Phone Number ID 和 E.164 企业号码均为必填" }, 400);
    const graphToken = text(Deno.env.get("WHATSAPP_ACCESS_TOKEN"), 4000), graphVersion = text(Deno.env.get("WHATSAPP_GRAPH_VERSION"), 20), webhookToken = text(Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN"), 300), appSecret = text(Deno.env.get("WHATSAPP_APP_SECRET"), 4000);
    if (!graphToken || !graphVersion || !webhookToken || !appSecret) return json({ error: "请先完整配置 WHATSAPP_ACCESS_TOKEN、WHATSAPP_GRAPH_VERSION、WHATSAPP_WEBHOOK_VERIFY_TOKEN 和 WHATSAPP_APP_SECRET" }, 400);
    const verifyResponse = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${graphToken}` }, signal: AbortSignal.timeout(15000) });
    let graphPayload = await verifyResponse.json().catch(() => ({}));
    if (!verifyResponse.ok || graphPayload?.id !== phoneNumberId) {
      const listResponse = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(businessAccountId)}/phone_numbers?fields=id,display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${graphToken}` }, signal: AbortSignal.timeout(15000) });
      const listPayload = await listResponse.json().catch(() => ({}));
      if (!listResponse.ok) return json({ error: `当前 Access Token 无法访问正式 WhatsApp Business Account ${businessAccountId}。请在 Meta Business Settings 中把该 WABA 分配给生成 Token 的系统用户，并重新生成包含 whatsapp_business_management 和 whatsapp_business_messaging 权限的永久 Token。Meta 返回：${text(listPayload?.error?.message || graphPayload?.error?.message || "无访问权限", 500)}` }, 502);
      const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
      const numbers = Array.isArray(listPayload?.data) ? listPayload.data : [];
      const matched = numbers.find((item: any) => digits(item?.display_phone_number) === digits(displayPhone)) || (numbers.length === 1 ? numbers[0] : null);
      if (!matched?.id) return json({ error: `该 WABA 中没有找到企业号码 ${displayPhone}。请确认 Business Account ID 和企业展示号码属于同一个 WhatsApp Business Account。` }, 502);
      phoneNumberId = text(matched.id, 120);
      graphPayload = matched;
    }
    const now = new Date().toISOString();
    const { data: connection, error } = await admin.from("whatsapp_connections").upsert({ provider, business_account_id: businessAccountId, phone_number_id: phoneNumberId, display_phone_number: displayPhone, display_name: displayName || graphPayload.verified_name || null, status: "connected", last_error: null, created_by: user.id, updated_by: user.id, updated_at: now }, { onConflict: "provider,phone_number_id" }).select("id,provider,status,display_phone_number,phone_number_id,display_name").single();
    if (error) return json({ error: "通道已验证，但保存连接失败：" + error.message }, 500);
    await admin.from("audit_logs").insert({ actor_id: user.id, entity_type: "whatsapp_connection", entity_id: connection.id, action: "whatsapp_connection_verified", after_data: { provider, business_account_id: businessAccountId, phone_number_id: phoneNumberId }, reason: "管理员验证并启用 WhatsApp Business 企业通道" });
    return json({ connection });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "WhatsApp 通道验证失败" }, 400); }
});
