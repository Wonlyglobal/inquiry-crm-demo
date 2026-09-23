import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
};
const decisions = new Set(["accepted", "modified", "ignored", "invalid", "opened_workflow"]);
const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);
function envKey(groupedName: string, standardName: string) {
  const grouped = Deno.env.get(groupedName);
  if (grouped) try { const value = JSON.parse(grouped).default || ""; if (value) return value; } catch { /* fallback */ }
  return Deno.env.get(standardName) || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "仅支持 POST" }), { status: 405, headers: cors });
  try {
    const authorization = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: cors });
    const { data: profile, error: profileError } = await userClient.from("profiles").select("id,role,active").eq("id", user.id).single();
    if (profileError || !profile?.active) return new Response(JSON.stringify({ error: "账号不可用" }), { status: 403, headers: cors });
    const body = await req.json();
    const adviceId = clean(body.advice_id, 80), decision = clean(body.decision, 30), note = clean(body.note, 500);
    if (!/^[a-z0-9-]{3,80}$/.test(adviceId) || !decisions.has(decision)) return new Response(JSON.stringify({ error: "反馈参数不正确" }), { status: 400, headers: cors });
    const { error } = await admin.from("audit_logs").insert({
      actor_id: user.id,
      entity_type: "profile",
      entity_id: user.id,
      action: "crm_advisor_feedback",
      after_data: { advice_id: adviceId, decision, phase: "read_only_v1", role: profile.role },
      reason: note || "人工反馈 AI 智能顾问建议",
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400, headers: cors });
  }
});
