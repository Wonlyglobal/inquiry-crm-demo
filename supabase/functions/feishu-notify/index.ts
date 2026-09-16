import { withReadOnlyGuard } from "../_shared/read-only.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Content-Type": "application/json" };
function envKey(groupedName: string, standardName: string) { const grouped = Deno.env.get(groupedName); if (grouped) { try { const key = JSON.parse(grouped).default || ""; if (key) return key; } catch { /* fallback */ } } return Deno.env.get(standardName) || ""; }
function clean(value: unknown, max = 2000) { return String(value || "").trim().slice(0, max); }
function errorText(error: unknown) { return error instanceof Error ? error.message : String(error || "未知错误"); }

Deno.serve(withReadOnlyGuard(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: cors });
    const input = await req.json();
    const inquiryId = clean(input.inquiry_id, 100);
    const action = clean(input.action, 30);
    if (!inquiryId || !["registered", "assigned"].includes(action)) return new Response(JSON.stringify({ error: "通知参数不完整" }), { status: 400, headers: cors });

    const [{ data: caller, error: callerError }, { data: inquiry, error: inquiryError }] = await Promise.all([
      userClient.from("profiles").select("id,full_name,role,active").eq("id", user.id).single(),
      admin.from("inquiries").select("id,inquiry_no,title,status,source,target_country,demand_summary,project_name,owner_id").eq("id", inquiryId).single(),
    ]);
    if (callerError || !caller?.active) throw callerError || new Error("账号不可用");
    if (inquiryError || !inquiry) throw inquiryError || new Error("询盘不存在");
    if (action === "registered" && !["owner", "marketing"].includes(caller.role)) return new Response(JSON.stringify({ error: "仅市场部或老板可发送登记通知" }), { status: 403, headers: cors });
    if (action === "assigned" && !["owner", "sales_manager"].includes(caller.role)) return new Response(JSON.stringify({ error: "仅销售主管或老板可发送分配通知" }), { status: 403, headers: cors });

    const webhookUrl = Deno.env.get("FEISHU_WEBHOOK_URL") || "";
    const appId = Deno.env.get("FEISHU_APP_ID") || "";
    const appSecret = Deno.env.get("FEISHU_APP_SECRET") || "";
    const chatId = Deno.env.get("FEISHU_CHAT_ID") || "";
    if (!webhookUrl && (!appId || !appSecret || !chatId)) throw new Error("飞书尚未配置：请设置群机器人 Webhook 或应用凭据");

    let ownerName = "待分配";
    if (inquiry.owner_id) { const { data: owner } = await admin.from("profiles").select("full_name").eq("id", inquiry.owner_id).maybeSingle(); ownerName = owner?.full_name || "已指定业务员"; }
    const no = String(inquiry.inquiry_no).padStart(6, "0");
    const lines = action === "registered" ? [
      `【新询盘已登记】${caller.full_name || "市场部"}创建了一条询盘`,
      `询盘编号：#${no}`,
      `询盘主题：${inquiry.title}`,
      `国家/地区：${inquiry.target_country || "待补充"}`,
      `需求：${inquiry.demand_summary || inquiry.project_name || "待补充"}`,
      `来源：${inquiry.source || "待补充"}`,
      "当前状态：待销售主管分配",
      `CRM详情：http://crm.foreverdoodle.com/#inquiry/${inquiry.id}`,
    ] : [
      "【询盘已完成分配】",
      `询盘编号：#${no}`,
      `询盘主题：${inquiry.title}`,
      `负责业务员：${ownerName}`,
      `分配人：${caller.full_name || "销售主管"}`,
      "当前状态：业务员待跟进",
      `CRM详情：http://crm.foreverdoodle.com/#inquiry/${inquiry.id}`,
    ];
    const eventType = action === "registered" ? "notify_manager_assignment" : "notify_sales_assignment";
    const { data: events } = await admin.from("integration_events").select("id").eq("inquiry_id", inquiryId).eq("event_type", eventType).eq("delivery_status", "pending");
    let token = "";
    if (!webhookUrl) {
      const tokenResponse = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: appId, app_secret: appSecret }) });
      const tokenJson = await tokenResponse.json();
      if (!tokenResponse.ok || tokenJson.code !== 0 || !tokenJson.tenant_access_token) throw new Error(`飞书鉴权失败：${tokenJson.msg || tokenResponse.status}`);
      token = tokenJson.tenant_access_token;
    }
    const sendResponse = webhookUrl
      ? await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg_type: "text", content: { text: lines.join("\n") } }) })
      : await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ receive_id: chatId, msg_type: "text", content: JSON.stringify({ text: lines.join("\n") }) }) });
    const sendJson = await sendResponse.json();
    if (!sendResponse.ok || sendJson.code !== 0) throw new Error(`飞书发送失败：${sendJson.msg || sendResponse.status}`);
    const sentAt = new Date().toISOString();
    const ids = (events || []).map((event) => event.id);
    if (ids.length) await admin.from("integration_events").update({ delivery_status: "sent", provider_message_id: sendJson.data?.message_id || null, delivered_at: sentAt, error_message: null }).in("id", ids);
    await admin.from("audit_logs").insert({ actor_id: user.id, entity_type: "inquiry", entity_id: inquiryId, action: `feishu_${action}_notified`, after_data: { channel: webhookUrl ? "group_webhook" : "app_chat", message_id: sendJson.data?.message_id || null }, reason: action === "registered" ? "新询盘登记后发送飞书群广播" : "询盘分配后发送飞书群广播" });
    return new Response(JSON.stringify({ sent: true, action, message_id: sendJson.data?.message_id || null }), { headers: cors });
  } catch (error) { return new Response(JSON.stringify({ error: errorText(error) }), { status: 400, headers: cors }); }
}));
