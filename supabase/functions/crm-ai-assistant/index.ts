import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Content-Type": "application/json" };
function envKey(groupedName: string, standardName: string) { const grouped = Deno.env.get(groupedName); if (grouped) { try { const key = JSON.parse(grouped).default || ""; if (key) return key; } catch { /* fallback */ } } return Deno.env.get(standardName) || ""; }
function clean(value: unknown, max: number) { return String(value || "").trim().slice(0, max); }
function errorText(error: unknown) { return error instanceof Error ? error.message : String(error || "未知错误"); }

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
    const { data: caller, error: callerError } = await userClient.from("profiles").select("id,full_name,role,active").eq("id", user.id).single();
    if (callerError || !caller?.active) return new Response(JSON.stringify({ error: "账号不可用" }), { status: 403, headers: cors });

    const input = await req.json();
    const question = clean(input.question, 800);
    const groundedAnswer = clean(input.grounded_answer, 12000);
    const history = Array.isArray(input.history) ? input.history.slice(-6).map((item: Record<string, unknown>) => ({ role: item.role === "assistant" ? "assistant" : "user", content: clean(item.content, 2000) })).filter((item: { content: string }) => item.content) : [];
    if (!question || !groundedAnswer) return new Response(JSON.stringify({ error: "问题或统计上下文不完整" }), { status: 400, headers: cors });
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY") || "";
    if (!apiKey) return new Response(JSON.stringify({ error: "DeepSeek API Key 尚未配置" }), { status: 503, headers: cors });

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat",
        temperature: 0.1,
        max_tokens: 900,
        messages: [
          { role: "system", content: "你是 WONLY CRM 数据助手。只能根据 CRM 已计算的可验证统计回答。严禁改动数字、币种、排名、时间和指标口径；严禁猜测缺失数据。用简洁中文，先结论后依据，保留统计周期、数据范围和口径。若用户问题超出已提供数据，明确说无法从当前数据确定。" },
          ...history,
          { role: "user", content: `用户问题：${question}\n\nCRM 已验证统计：\n${groundedAnswer}` },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`DeepSeek 调用失败：${payload?.error?.message || response.status}`);
    const answer = clean(payload?.choices?.[0]?.message?.content, 12000);
    if (!answer) throw new Error("DeepSeek 未返回有效答案");
    await admin.from("audit_logs").insert({ actor_id: user.id, entity_type: "profile", entity_id: user.id, action: "crm_ai_question", after_data: { provider: "deepseek", model: Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat", question }, reason: "成员使用 CRM AI 数据助手" });
    return new Response(JSON.stringify({ answer, provider: "deepseek", grounded: true }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: errorText(error) }), { status: 400, headers: cors });
  }
});
