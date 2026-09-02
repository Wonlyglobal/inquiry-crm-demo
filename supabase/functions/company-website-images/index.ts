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

function clean(value: unknown, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function safeWebsite(value: unknown) {
  const raw = clean(value, 500);
  if (!raw) throw new Error("请先填写公司官网");
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || hostname === "localhost" || hostname.endsWith(".local") || /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) {
    throw new Error("仅支持公开 HTTPS 公司官网");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

function absoluteUrl(value: string, base: URL) {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
}

function meta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = new RegExp("<meta[^>]+(?:property|name)=[\"']" + escaped + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i").exec(html)?.[1];
  const second = new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"']" + escaped + "[\"'][^>]*>", "i").exec(html)?.[1];
  return clean(first || second, 2000);
}

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function plainText(value: string, max = 500) {
  return clean(decodeXml(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), max);
}

function officialAddressFromWebsite(html: string) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeXml(match[1]));
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item)) { queue.push(...item); continue; }
        const address = item.address;
        if (typeof address === "string" && /\d/.test(address)) return { address: clean(address, 600), method: "官网结构化数据" };
        if (address && typeof address === "object") {
          const country = typeof address.addressCountry === "object" ? address.addressCountry.name : address.addressCountry;
          const formatted = [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode, country].map((value) => clean(value, 160)).filter(Boolean).join(", ");
          if (formatted && /\d/.test(formatted)) return { address: clean(formatted, 600), method: "官网结构化数据" };
        }
        queue.push(...Object.values(item).filter((value) => value && typeof value === "object"));
      }
    } catch { /* malformed optional JSON-LD */ }
  }
  const addressTag = [...html.matchAll(/<address[^>]*>([\s\S]*?)<\/address>/gi)].map((match) => plainText(match[1], 600)).find((value) => /\d/.test(value));
  if (addressTag) return { address: addressTag, method: "官网联系地址" };
  const lines = decodeXml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "\n").replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<(?:br|p|div|li|footer|section|td|tr|h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .split(/\n+/).map((line) => clean(line.replace(/\s+/g, " "), 700)).filter(Boolean);
  const countryPattern = /Argentina|Brasil|Brazil|Chile|Uruguay|Paraguay|M[eé]xico|Mexico|Colombia|Per[uú]|Ecuador|Bolivia|Espa[nñ]a|Spain|Portugal|United States|USA|UAE|Saudi Arabia|India|China/i;
  const streetPattern = /(?:direcci[oó]n|address|ubicaci[oó]n)?\s*:?[\s-]*([\p{L}][\p{L}\d.' -]{2,70}\s\d{1,6}(?:\s*[,.-]\s*[^|]{2,100})?)/iu;
  for (let index = 0; index < lines.length; index++) {
    const combined = [lines[index], lines[index + 1], lines[index + 2]].filter(Boolean).join(", ");
    const address = streetPattern.exec(combined)?.[1];
    if (address && (countryPattern.test(combined) || /direcci[oó]n|address|ubicaci[oó]n/i.test(combined))) return { address: clean(address, 600), method: "官网页脚/联系信息" };
  }
  return { address: "", method: "" };
}

function exactCompanyMention(title: string, companyName: string, hostname: string) {
  const legal = new Set(["ltd", "limited", "inc", "corp", "corporation", "company", "co", "sa", "srl", "llc", "group"]);
  const tokens = (companyName || hostname.split(".")[0]).toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, " ").trim().split(/\s+/).filter((token) => token.length >= 3 && !legal.has(token));
  if (!tokens.length) return false;
  const normalizedTitle = title.toLowerCase();
  return tokens.slice(0, 3).every((token) => new RegExp("(^|[^a-z0-9\\u00c0-\\u024f])" + token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9\\u00c0-\\u024f]|$)", "i").test(normalizedTitle));
}

function categoryJudgement(value: string) {
  const categories: Array<[RegExp, string]> = [
    [/security doors?|steel doors?|puertas? de seguridad/i, "钢制安全门"],
    [/locks?|cerraduras?|multi[- ]?point/i, "锁具/多点锁"],
    [/fire doors?|puertas? cortafuego/i, "防火门"],
    [/garage doors?|portones?/i, "车库门/大门"],
    [/automation|automatizaci[oó]n|operators?|motors?/i, "门体自动化"],
    [/hotel|apartment|residential|commercial|project/i, "工程项目"],
  ];
  return [...new Set(categories.filter(([pattern]) => pattern.test(value)).map(([, label]) => label))];
}

function chineseSeoSummary(items: string[], newsCount: number) {
  const dictionary: Array<[RegExp, string]> = [
    [/accesorios|accessories/i, "配件"], [/repuestos|spare parts/i, "备件"],
    [/automatizaci[oó]n|automation/i, "门体自动化"], [/seguridad|security/i, "安全"],
    [/comodidad|convenience/i, "便利性"], [/adaptabilidad|adaptability/i, "适应性"],
    [/puertas?|doors?/i, "门类产品"], [/portones?|garage doors?/i, "大门及车库门"],
    [/motores?|motors?/i, "电机"], [/controles?|controls?/i, "控制系统"],
    [/electr[oó]nica|electronics/i, "电子产品"], [/cerraduras?|locks?/i, "锁具"],
  ];
  const translated = [...new Set(dictionary.filter(([pattern]) => items.some((item) => pattern.test(item))).map(([, value]) => value))];
  const focus = translated.length ? `官网内容显示该公司重点关注：${translated.join("、")}。` : "官网公开内容未能可靠归纳出明确的中文品类重点。";
  const news = newsCount ? `已检索到 ${newsCount} 条公司名称精确匹配的近期公开新闻，原始标题和来源保留在下方。` : "未检索到与公司名称精确匹配的近期公开新闻；系统已排除相似词造成的无关结果。";
  return `${focus}\n${news}`;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization") || "";
    const client = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: cors });
    const input = await req.json();
    const inquiryId = clean(input.inquiry_id, 100);
    const companyName = clean(input.company_name, 300);
    const website = safeWebsite(input.website);
    const [{ data: profile }, { data: inquiry, error: inquiryError }] = await Promise.all([
      client.from("profiles").select("id,active").eq("id", user.id).single(),
      client.from("inquiries").select("id").eq("id", inquiryId).single(),
    ]);
    if (!profile?.active) throw new Error("账号不可用");
    if (inquiryError || !inquiry) throw inquiryError || new Error("无权查看该询盘");

    const response = await fetch(website, {
      redirect: "error",
      headers: { "User-Agent": "WONLY-CRM-Research/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("官网读取失败：HTTP " + response.status);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error("官网首页不是 HTML 页面");
    const html = (await response.text()).slice(0, 1_500_000);
    const officialAddress = officialAddressFromWebsite(html);
    const candidates: Array<{ url: string; source: string; source_page: string; verified: boolean }> = [];
    const add = (value: string, source: string) => {
      const url = absoluteUrl(value, website);
      if (url && !candidates.some((item) => item.url === url)) candidates.push({ url, source, source_page: website.toString(), verified: false });
    };
    add(meta(html, "og:image"), "官网 Open Graph 图片");
    add(meta(html, "twitter:image"), "官网 Twitter Card 图片");
    const logo = /<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html)?.[1]
      || /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/i.exec(html)?.[1];
    add(clean(logo, 2000), "官网图标/Logo");
    const keywords = meta(html, "keywords").split(/[,，;；|]/).map((item) => clean(item, 120)).filter(Boolean);
    const description = meta(html, "description") || meta(html, "og:description");
    const title = plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "", 240);
    const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
      .map((match) => plainText(match[1], 180)).filter(Boolean).slice(0, 12);
    const pageEvidence: Array<{ url: string; title: string; description: string; headings: string[] }> = [{ url: website.toString(), title, description, headings }];
    const internalLinks = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi)].map((match) => absoluteUrl(clean(match[1], 1500), website)).filter((url) => {
      try { const parsed = new URL(url); return parsed.hostname === website.hostname && /product|catalog|solution|project|about|company|empresa|producto|puerta|door|lock/i.test(parsed.pathname); } catch { return false; }
    });
    for (const pageUrl of [...new Set(internalLinks)].slice(0, 4)) {
      try {
        const pageResponse = await fetch(pageUrl, { redirect: "error", headers: { "User-Agent": "WONLY-CRM-Research/1.0", Accept: "text/html" }, signal: AbortSignal.timeout(6000) });
        if (!pageResponse.ok || !(pageResponse.headers.get("content-type") || "").includes("text/html")) continue;
        const pageHtml = (await pageResponse.text()).slice(0, 900_000);
        const pageTitle = plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(pageHtml)?.[1] || "", 240);
        const pageDescription = meta(pageHtml, "description") || meta(pageHtml, "og:description");
        const pageHeadings = [...pageHtml.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((match) => plainText(match[1], 180)).filter(Boolean).slice(0, 10);
        pageEvidence.push({ url: pageUrl, title: pageTitle, description: pageDescription, headings: pageHeadings });
      } catch { /* optional supporting page */ }
    }
    const seoFocus = [...new Set([...keywords, ...pageEvidence.flatMap((page) => [page.title, page.description, ...page.headings])].filter(Boolean))].slice(0, 24);
    const categorySignals = categoryJudgement(seoFocus.join(" "));

    const news: Array<{ title: string; date: string; source_url: string; display: string }> = [];
    const newsQuery = [companyName || title, website.hostname.replace(/^www\./, "")].filter(Boolean).join(" ");
    if (newsQuery) {
      try {
        const rssUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent(`\"${companyName || title}\" ${website.hostname.replace(/^www\./, "")}`) + "&hl=en&gl=US&ceid=US:en";
        const rssResponse = await fetch(rssUrl, { headers: { "User-Agent": "WONLY-CRM-Research/1.0" }, signal: AbortSignal.timeout(8000) });
        if (rssResponse.ok) {
          const xml = (await rssResponse.text()).slice(0, 1_000_000);
          for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
            const block = item[1];
            const newsTitle = plainText(/<title>([\s\S]*?)<\/title>/i.exec(block)?.[1] || "", 400);
            const sourceUrl = plainText(/<link>([\s\S]*?)<\/link>/i.exec(block)?.[1] || "", 1000);
            const date = plainText(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block)?.[1] || "", 120);
            if (newsTitle && sourceUrl && exactCompanyMention(newsTitle, companyName, website.hostname)) {
              const categories = categoryJudgement(newsTitle);
              const judgement = categories.length ? `关联品类：${categories.join("、")}` : "公司动态：未识别到门锁品类或项目指向";
              news.push({ title: newsTitle, date, source_url: sourceUrl, display: [newsTitle, date, judgement, sourceUrl].filter(Boolean).join("｜") });
            }
            if (news.length >= 8) break;
          }
        }
      } catch { /* news is optional; website intelligence still succeeds */ }
    }
    return new Response(JSON.stringify({
      website: website.toString(), candidates: candidates.slice(0, 6),
      website_profile: { title, description, keywords, headings },
      website_evidence: pageEvidence,
      seo_focus_categories: seoFocus,
      project_category_signals: categorySignals,
      news_signals: news,
      chinese_summary: chineseSeoSummary(seoFocus, news.length),
      official_address: officialAddress.address,
      official_address_method: officialAddress.method,
      official_address_source: officialAddress.address ? website.toString() : "",
    }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: errorText(error) }), { status: 400, headers: cors });
  }
});

