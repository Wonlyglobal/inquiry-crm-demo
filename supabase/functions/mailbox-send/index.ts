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
    try { const key = JSON.parse(grouped)["default"] || ""; if (key) return key; } catch { /* legacy fallback */ }
  }
  return Deno.env.get(standardName) || "";
}

function clean(value: unknown, max = 10000) {
  return String(value || "").trim().slice(0, max);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

Deno.serve(async (req) => {
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

    const body = await req.json();
    const inquiryId = clean(body.inquiry_id, 100);
    const draftId = clean(body.draft_id, 100);
    const subject = clean(body.subject, 300);
    const messageBody = clean(body.body, 50000);
    if (!inquiryId || !draftId || !subject || !messageBody) {
      return new Response(JSON.stringify({ error: "邮件信息不完整" }), { status: 400, headers: cors });
    }

    const [{ data: caller, error: callerError }, { data: inquiry, error: inquiryError }] = await Promise.all([
      userClient.from("profiles").select("id,email,full_name,role,active").eq("id", user.id).single(),
      userClient.from("inquiries").select("id,owner_id,title,email_intake(sender_email)").eq("id", inquiryId).single(),
    ]);
    if (callerError || !caller?.active) throw callerError || new Error("账号不可用");
    if (inquiryError || !inquiry) return new Response(JSON.stringify({ error: "无权访问该询盘" }), { status: 403, headers: cors });
    const canSend = inquiry.owner_id === user.id || ["owner", "sales_manager"].includes(caller.role);
    if (!canSend) return new Response(JSON.stringify({ error: "仅负责人或主管可以发送开发信" }), { status: 403, headers: cors });

    const intake = Array.isArray(inquiry.email_intake) ? inquiry.email_intake[0] : inquiry.email_intake;
    const recipient = clean((intake as { sender_email?: string } | null)?.sender_email, 320).toLowerCase();
    if (!recipient) return new Response(JSON.stringify({ error: "询盘没有可用的客户邮箱" }), { status: 400, headers: cors });
    const { data: draft, error: draftError } = await admin.from("outreach_drafts").select("id,inquiry_id,status,created_by").eq("id", draftId).eq("inquiry_id", inquiryId).single();
    if (draftError || !draft) throw draftError || new Error("开发信草稿不存在");
    if (draft.status === "sent") return new Response(JSON.stringify({ error: "该开发信已经发送，请勿重复发送" }), { status: 409, headers: cors });

    const { data: connection, error: connectionError } = await admin.from("mailbox_connections")
      .select("id,email,smtp_host,smtp_port,status").eq("user_id", user.id).eq("status", "connected").single();
    if (connectionError || !connection) return new Response(JSON.stringify({ error: "请先连接当前业务员自己的企业邮箱" }), { status: 400, headers: cors });
    const { data: password, error: secretError } = await admin.rpc("read_mailbox_secret", { target_connection_id: connection.id });
    if (secretError || !password) throw secretError || new Error("邮箱凭据不可用，请重新连接邮箱");

    const transport = nodemailer.createTransport({
      host: connection.smtp_host, port: connection.smtp_port, secure: Number(connection.smtp_port) === 465,
      auth: { user: connection.email, pass: password }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    });
    try {
      const { data: intake } = await admin.from("email_intake").select("message_id").eq("inquiry_id", inquiryId).maybeSingle();
      const threadId = clean(intake?.message_id, 500);
      const sent = await transport.sendMail({
        from: `"${caller.full_name || connection.email}" <${connection.email}>`, to: recipient, subject, text: messageBody,
        ...(threadId ? { inReplyTo: threadId, references: [threadId] } : {}),
      });
      const sentAt = new Date().toISOString();
      await admin.from("outreach_drafts").update({ status: "sent", selected_subject: subject, body: messageBody, sent_at: sentAt, message_id: sent.messageId || null, last_error: null, updated_at: sentAt }).eq("id", draftId);
      await admin.from("audit_logs").insert({ actor_id: user.id, entity_type: "inquiry", entity_id: inquiryId, action: "outreach_email_sent", after_data: { draft_id: draftId, recipient, message_id: sent.messageId || null }, reason: "业务员从 CRM 发送开发信" });
      return new Response(JSON.stringify({ sent: true, recipient, message_id: sent.messageId || null, sent_at: sentAt }), { headers: cors });
    } catch (error) {
      await admin.from("outreach_drafts").update({ status: "failed", last_error: errorText(error), updated_at: new Date().toISOString() }).eq("id", draftId);
      throw error;
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: errorText(error) }), { status: 400, headers: cors });
  }
});
