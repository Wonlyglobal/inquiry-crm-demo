import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import nodemailer from "npm:nodemailer@7.0.6";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};

function envKey(groupedName: string, standardName: string) {
  const grouped = Deno.env.get(groupedName);
  if (grouped) {
    try { const key = JSON.parse(grouped).default || ""; if (key) return key; } catch { /* legacy fallback */ }
  }
  return Deno.env.get(standardName) || "";
}

function clean(value: unknown, max = 50000) {
  return String(value || "").trim().slice(0, max);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let eventId: number | null = null;
  let admin: ReturnType<typeof createClient> | null = null;
  try {
    const authorization = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: authorization } } });
    admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: cors });

    const inquiryId = clean((await req.json()).inquiry_id, 100);
    if (!inquiryId) return new Response(JSON.stringify({ error: "缺少询盘编号" }), { status: 400, headers: cors });
    const { data: caller, error: callerError } = await userClient.from("profiles").select("id,email,full_name,role,active").eq("id", user.id).single();
    if (callerError || !caller?.active) throw callerError || new Error("账号不可用");
    if (!["owner", "sales_manager", "marketing"].includes(caller.role)) return new Response(JSON.stringify({ error: "仅市场部、销售主管或老板可转发原邮件" }), { status: 403, headers: cors });

    const { data: event, error: eventError } = await admin.from("integration_events")
      .select("id,email_intake_id,payload").eq("inquiry_id", inquiryId).eq("event_type", "forward_original_email")
      .eq("delivery_status", "pending").order("created_at", { ascending: false }).limit(1).single();
    if (eventError || !event) throw eventError || new Error("没有待处理的原邮件转发任务");
    eventId = event.id;

    const [{ data: intake, error: intakeError }, { data: inquiry, error: inquiryError }, { data: connection, error: connectionError }] = await Promise.all([
      admin.from("email_intake").select("id,sender_email,sender_name,recipient_email,subject,body_text,received_at,forwarded_at").eq("id", event.email_intake_id).single(),
      admin.from("inquiries").select("id,inquiry_no,title,owner_id").eq("id", inquiryId).single(),
      admin.from("mailbox_connections").select("id,email,smtp_host,smtp_port,status").eq("mailbox_kind", "shared_inquiry").eq("status", "connected").limit(1).single(),
    ]);
    if (intakeError || !intake) throw intakeError || new Error("原始邮件不存在");
    if (inquiryError || !inquiry) throw inquiryError || new Error("询盘不存在");
    if (intake.forwarded_at) return new Response(JSON.stringify({ error: "该原邮件已经转发" }), { status: 409, headers: cors });
    if (connectionError || !connection) throw new Error("请先连接公共询盘邮箱");

    const recipient = clean((event.payload as { to?: string } | null)?.to, 320).toLowerCase();
    const { data: assignee } = await admin.from("profiles").select("email,full_name,role,active").eq("id", inquiry.owner_id).single();
    if (!assignee?.active || assignee.role !== "sales" || recipient !== clean(assignee.email, 320).toLowerCase()) throw new Error("转发收件人与当前负责业务员不一致");
    const { data: password, error: secretError } = await admin.rpc("read_mailbox_secret", { target_connection_id: connection.id });
    if (secretError || !password) throw secretError || new Error("邮箱凭据不可用，请重新连接邮箱");

    const transport = nodemailer.createTransport({
      host: connection.smtp_host, port: connection.smtp_port, secure: Number(connection.smtp_port) === 465,
      auth: { user: connection.email, pass: password }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    });
    const originalSubject = clean(intake.subject, 240) || inquiry.title;
    const originalBody = clean(intake.body_text);
    const sent = await transport.sendMail({
      from: `"WONLY 询盘中心" <${connection.email}>`,
      to: recipient,
      subject: `Fwd: [询盘 #${String(inquiry.inquiry_no).padStart(6, "0")}] ${originalSubject}`,
      text: `${assignee.full_name || "业务员"}：\n\n销售主管已在 CRM 将以下询盘分配给你，请及时跟进。\n询盘主题：${inquiry.title}\n客户发件人：${intake.sender_name || "—"} <${intake.sender_email}>\n收件时间：${intake.received_at || "—"}\n\n---------------- 原邮件 ----------------\nSubject: ${originalSubject}\nFrom: ${intake.sender_name || ""} <${intake.sender_email}>\nTo: ${intake.recipient_email || "inquiry@wonlyglobal.com"}\n\n${originalBody}`,
    });
    const sentAt = new Date().toISOString();
    await Promise.all([
      admin.from("integration_events").update({ delivery_status: "sent", provider_message_id: sent.messageId || null, delivered_at: sentAt, error_message: null }).eq("id", event.id),
      admin.from("email_intake").update({ processing_status: "forwarded", forwarded_at: sentAt, forwarded_by: user.id, forward_recipient: recipient, updated_at: sentAt }).eq("id", intake.id),
      admin.from("audit_logs").insert({ actor_id: user.id, entity_type: "inquiry", entity_id: inquiryId, action: "original_email_forwarded", after_data: { recipient, event_id: event.id, message_id: sent.messageId || null }, reason: "分配完成后从公共询盘邮箱转发原邮件给负责业务员" }),
    ]);
    return new Response(JSON.stringify({ forwarded: true, recipient, sent_at: sentAt, message_id: sent.messageId || null }), { headers: cors });
  } catch (error) {
    if (admin && eventId) await admin.from("integration_events").update({ delivery_status: "failed", error_message: errorText(error), delivered_at: new Date().toISOString() }).eq("id", eventId);
    return new Response(JSON.stringify({ error: errorText(error) }), { status: 400, headers: cors });
  }
});
