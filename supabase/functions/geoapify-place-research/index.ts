import { withReadOnlyGuard } from "../_shared/read-only.ts";
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
      const key = JSON.parse(grouped).default || "";
      if (key) return key;
    } catch { /* use standard variable */ }
  }
  return Deno.env.get(standardName) || "";
}

function clean(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

Deno.serve(withReadOnlyGuard(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const userClient = createClient(supabaseUrl, publishable, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: cors });
    }

    const input = await req.json();
    const inquiryId = clean(input.inquiry_id, 100);
    const companyName = clean(input.company_name);
    const domain = clean(input.domain);
    const country = clean(input.country, 120);
    if (!inquiryId || !companyName) {
      return new Response(JSON.stringify({ error: "请先填写公司名称" }), { status: 400, headers: cors });
    }

    const [{ data: profile, error: profileError }, { data: inquiry, error: inquiryError }] = await Promise.all([
      userClient.from("profiles").select("id,role,active").eq("id", user.id).single(),
      userClient.from("inquiries").select("id").eq("id", inquiryId).single(),
    ]);
    if (profileError || !profile?.active) throw profileError || new Error("账号不可用");
    if (inquiryError || !inquiry) throw inquiryError || new Error("无权查看该询盘");

    const apiKey = Deno.env.get("GEOAPIFY_API_KEY") || "";
    const query = [companyName, domain, country].filter(Boolean).join(" ");
    const googleMapsSearchUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
    const osmSearchUrl = "https://www.openstreetmap.org/search?query=" + encodeURIComponent(query);
    if (!apiKey) {
      return new Response(JSON.stringify({
        configured: false,
        query,
        candidates: [],
        google_maps_search_url: googleMapsSearchUrl,
        openstreetmap_search_url: osmSearchUrl,
      }), { headers: cors });
    }

    const endpoint = new URL("https://api.geoapify.com/v1/geocode/search");
    endpoint.searchParams.set("text", query);
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("limit", "5");
    endpoint.searchParams.set("lang", "en");
    endpoint.searchParams.set("apiKey", apiKey);
    const response = await fetch(endpoint);
    const payload = await response.json();
    if (!response.ok) throw new Error("Geoapify 查询失败：" + (payload?.message || response.status));

    const candidates = (payload.results || []).map((item: Record<string, unknown>) => {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      return {
        place_id: clean(item.place_id, 200),
        formatted_address: clean(item.formatted, 600),
        country: clean(item.country, 120),
        city: clean(item.city || item.county || item.state, 120),
        result_type: clean(item.result_type, 80),
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lon) ? lon : null,
        google_maps_url: Number.isFinite(lat) && Number.isFinite(lon)
          ? "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lon
          : googleMapsSearchUrl,
        openstreetmap_url: Number.isFinite(lat) && Number.isFinite(lon)
          ? "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lon + "#map=17/" + lat + "/" + lon
          : osmSearchUrl,
      };
    }).filter((item: { formatted_address: string }) => item.formatted_address);

    return new Response(JSON.stringify({
      configured: true,
      provider: "geoapify",
      query,
      candidates,
      google_maps_search_url: googleMapsSearchUrl,
      openstreetmap_search_url: osmSearchUrl,
    }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: errorText(error) }), { status: 400, headers: cors });
  }
}));
