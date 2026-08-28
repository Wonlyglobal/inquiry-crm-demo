import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};

function envKey(groupedName: string, standardName: string) {
  const grouped = Deno.env.get(groupedName);
  if (grouped) {
    try {
      const key = JSON.parse(grouped)["default"] || "";
      if (key) return key;
    } catch { /* Fall through to legacy key. */ }
  }
  return Deno.env.get(standardName) || "";
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return [value.message || value.error, value.details, value.hint].filter(Boolean).join("；") || JSON.stringify(value);
  }
  return String(error || "未知错误");
}

function createTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
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
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: cors });

    const { data: caller, error: callerError } = await userClient.from("profiles").select("role,email").eq("id", user.id).single();
    if (callerError) throw callerError;
    if (caller.role !== "owner") {
      return new Response(JSON.stringify({ error: "当前账号无权新增成员" }), { status: 403, headers: cors });
    }

    const body = await req.json();
    const action = String(body.action || "create");
    if (["disable", "enable"].includes(action)) {
      const targetUserId = String(body.user_id || "");
      if (!targetUserId) return new Response(JSON.stringify({ error: "缺少成员账号" }), { status: 400, headers: cors });
      if (targetUserId === user.id) return new Response(JSON.stringify({ error: "不能禁用或恢复当前登录账号" }), { status: 400, headers: cors });

      const { data: target, error: targetError } = await admin.from("profiles").select("id,email,full_name,active").eq("id", targetUserId).single();
      if (targetError || !target) throw targetError || new Error("成员不存在");
      const { data: authTargetData, error: authTargetError } = await admin.auth.admin.getUserById(targetUserId);
      if (authTargetError || !authTargetData.user) throw authTargetError || new Error("成员认证账号不存在");
      const existingAppMetadata = authTargetData.user.app_metadata || {};

      if (action === "disable") {
        const reasonType = String(body.reason_type || "");
        const reason = String(body.reason || "").trim();
        if (!['departed', 'other'].includes(reasonType)) {
          return new Response(JSON.stringify({ error: "请选择离职或其他原因" }), { status: 400, headers: cors });
        }
        if (reasonType === "other" && !reason) {
          return new Response(JSON.stringify({ error: "选择其他原因时必须填写说明" }), { status: 400, headers: cors });
        }
        const { error: banError } = await admin.auth.admin.updateUserById(targetUserId, {
          ban_duration: "876000h",
          app_metadata: { ...existingAppMetadata, crm_disabled: true, crm_disabled_reason: reasonType },
        });
        if (banError) throw banError;
        const disabledAt = new Date().toISOString();
        const { error: profileError } = await admin.from("profiles").update({
          active: false,
          disabled_reason_type: reasonType,
          disabled_reason: reason || (reasonType === "departed" ? "离职" : "其他原因"),
          disabled_at: disabledAt,
          disabled_by: user.id,
          updated_at: disabledAt,
        }).eq("id", targetUserId);
        if (profileError) throw profileError;
        await admin.from("mailbox_connections").update({ status: "disabled", updated_at: disabledAt }).eq("user_id", targetUserId);
        await admin.from("audit_logs").insert({
          actor_id: user.id, entity_type: "profile", entity_id: targetUserId,
          action: "member_disabled", before_data: { active: target.active },
          after_data: { active: false, reason_type: reasonType },
          reason: reason || (reasonType === "departed" ? "离职" : "其他原因"),
        });
        return new Response(JSON.stringify({ member: { id: targetUserId, active: false } }), { headers: cors });
      }

      const { error: unbanError } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: "none",
        app_metadata: { ...existingAppMetadata, crm_disabled: false, crm_disabled_reason: null },
      });
      if (unbanError) throw unbanError;
      const enabledAt = new Date().toISOString();
      const { error: profileError } = await admin.from("profiles").update({
        active: true, reactivated_at: enabledAt, reactivated_by: user.id, updated_at: enabledAt,
      }).eq("id", targetUserId);
      if (profileError) throw profileError;
      await admin.from("audit_logs").insert({
        actor_id: user.id, entity_type: "profile", entity_id: targetUserId,
        action: "member_reactivated", before_data: { active: target.active },
        after_data: { active: true }, reason: String(body.reason || "管理员恢复成员账号"),
      });
      return new Response(JSON.stringify({ member: { id: targetUserId, active: true } }), { headers: cors });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const team = String(body.team || "").trim();
    const jobTitle = String(body.job_title || "").trim();
    const role = String(body.role || "");
    if (!email || !fullName || !team || !jobTitle || !["owner", "sales_manager", "marketing", "sales"].includes(role)) {
      return new Response(JSON.stringify({ error: "请完整填写成员信息" }), { status: 400, headers: cors });
    }

    const temporaryPassword = createTemporaryPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
    });
    if (createError || !created.user) throw createError || new Error("账号创建失败");

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      email,
      full_name: fullName,
      team,
      job_title: jobTitle,
      role,
      active: true,
      must_change_password: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }

    return new Response(JSON.stringify({
      member: { id: created.user.id, email, full_name: fullName },
      temporary_password: temporaryPassword,
    }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: errorText(error) }), { status: 400, headers: cors });
  }
});
