import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};

const mailboxAdministrators = new Set([
  "chloelee@wonlyglobal.com",
  "lyle@wonlyglobal.com",
]);

function envKey(groupedName: string, standardName: string) {
  const grouped = Deno.env.get(groupedName);
  if (grouped) {
    try {
      const key = JSON.parse(grouped)["default"] || "";
      if (key) return key;
    } catch {
      // Fall through to the legacy key.
    }
  }
  return Deno.env.get(standardName) || "";
}

const aliyunEndpoints = [
  { label: "阿里企业邮", smtp: "smtp.qiye.aliyun.com", imap: "imap.qiye.aliyun.com" },
  { label: "阿里云邮箱", smtp: "smtp.mxhichina.com", imap: "imap.mxhichina.com" },
];

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return [value.message || value.error, value.details, value.hint].filter(Boolean).join("；") || JSON.stringify(value);
  }
  return String(error || "未知错误");
}

function quoteImap(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function readImapUntil(conn: Deno.Conn, tag: string, timeoutMs = 15000) {
  const decoder = new TextDecoder();
  const buffer = new Uint8Array(8192);
  let response = "";
  const readResponse = async () => {
    while (!response.match(new RegExp(`(?:^|\\r?\\n)${tag}\\s`, "i"))) {
      const size = await conn.read(buffer);
      if (size === null) break;
      response += decoder.decode(buffer.subarray(0, size), { stream: true });
      if (response.length > 65536) throw new Error("IMAP 服务器响应过长");
    }
    return response;
  };
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      readResponse(),
      new Promise<string>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("IMAP 服务器响应超时")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function testImap(hostname: string, email: string, password: string) {
  const conn = await Deno.connectTls({ hostname, port: 993 });
  const encoder = new TextEncoder();
  try {
    const greeting = await readImapUntil(conn, "\\*");
    if (!/^\*\s+OK/im.test(greeting)) throw new Error("服务器未返回 IMAP 就绪信息");
    await conn.write(encoder.encode(`a1 LOGIN ${quoteImap(email)} ${quoteImap(password)}\r\n`));
    const login = await readImapUntil(conn, "a1");
    if (!/(?:^|\r?\n)a1\s+OK\b/im.test(login)) {
      const reason = login.match(/(?:^|\r?\n)a1\s+(?:NO|BAD)\s+([^\r\n]+)/i)?.[1] || "服务器拒绝登录";
      throw new Error(reason);
    }
    await conn.write(encoder.encode("a2 LOGOUT\r\n"));
  } finally {
    try { conn.close(); } catch { /* Already closed. */ }
  }
}

async function testMailbox(email: string, password: string) {
  const failures: string[] = [];
  for (const endpoint of aliyunEndpoints) {
    try {
      const smtp = nodemailer.createTransport({
        host: endpoint.smtp, port: 465, secure: true,
        auth: { user: email, pass: password },
        connectionTimeout: 15000, greetingTimeout: 15000,
      });
      await smtp.verify();
    } catch (error) {
      failures.push(`${endpoint.label} SMTP：${errorText(error)}`);
      continue;
    }

    // Supabase Edge terminates some long-lived IMAP TCP sessions even when the
    // same credentials authenticate successfully from a regular server.
    // SMTP authentication is sufficient for securely storing the connection;
    // mailbox synchronization runs from the persistent worker environment.
    return endpoint;
  }
  throw new Error("阿里邮箱连接失败。" + failures.join("；"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!publishable || !secret) throw new Error("服务端密钥未配置");
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, secret);
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: cors });
    const { data: caller, error: callerError } = await userClient.from("profiles").select("role,email,active").eq("id", user.id).single();
    if (callerError) throw new Error("无法校验配置权限：" + callerError.message);
    if (!caller.active) return new Response(JSON.stringify({ error: "账号已停用" }), { status: 403, headers: cors });
    const callerEmail = String(caller.email || user.email || "").toLowerCase();

    const body = await req.json();
    const userId = String(body.user_id || "");
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!userId || !email || !password) return new Response(JSON.stringify({ error: "成员、邮箱和客户端密码均为必填" }), { status: 400, headers: cors });
    const canManageOthers = caller.role === "owner" || mailboxAdministrators.has(callerEmail);
    const canSelfConnect = ["sales", "sales_manager"].includes(String(caller.role || ""));
    if (!canManageOthers && (!canSelfConnect || userId !== user.id || email !== callerEmail)) {
      return new Response(JSON.stringify({ error: "业务员只能连接自己的企业邮箱" }), { status: 403, headers: cors });
    }

    const endpoint = await testMailbox(email, password);

    const { data: connection, error: saveError } = await admin.from("mailbox_connections").upsert({
      user_id: userId, email, smtp_host: endpoint.smtp, imap_host: endpoint.imap,
      status: "connected", last_tested_at: new Date().toISOString(),
      error_message: null, created_by: user.id, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }).select("id,email,status,last_tested_at").single();
    if (saveError) throw saveError;
    const { error: vaultError } = await admin.rpc("store_mailbox_secret", { target_connection_id: connection.id, secret_value: password });
    if (vaultError) throw vaultError;
    await admin.from("audit_logs").insert({
      actor_id: user.id, entity_type: "profile", entity_id: userId, action: "mailbox_connected",
      after_data: { email, status: "connected", self_service: userId === user.id },
      reason: userId === user.id ? "成员自行连接企业邮箱" : "管理员代成员连接企业邮箱",
    });
    return new Response(JSON.stringify({ connection }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: errorText(error) }), { status: 400, headers: cors });
  }
});
