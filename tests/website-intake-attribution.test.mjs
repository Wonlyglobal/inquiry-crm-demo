import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseWebsiteFormMessage} from "../mail-sync/src/website-form.mjs";

const sql=await readFile(new URL("../supabase/migrations/20260910101733_website_intake_attribution.sql",import.meta.url),"utf8");
const edge=await readFile(new URL("../supabase/functions/website-inquiry-intake/index.ts",import.meta.url),"utf8");
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const sync=await readFile(new URL("../mail-sync/src/index.mjs",import.meta.url),"utf8");

test("website intake is idempotent, monitored and service-role only",()=>{
  assert.match(sql,/event_key text not null unique/);
  assert.match(sql,/on conflict\(event_key\) do nothing/);
  assert.match(sql,/for update/);
  assert.match(sql,/status='failed'/);
  assert.match(sql,/latency_ms/);
  assert.match(sql,/revoke all on function public\.ingest_website_inquiry\(jsonb\) from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.ingest_website_inquiry\(jsonb\) to service_role/);
});

test("website intake persists precise attribution and journey evidence",()=>{
  for(const column of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","referrer_url","session_ref"]) assert.match(sql,new RegExp(column));
  assert.match(sql,/insert into public\.inquiry_marketing_touches/);
  assert.match(sql,/insert into public\.inquiry_user_journey_events/);
  assert.match(sql,/website_realtime_intake/);
});

test("edge endpoint requires a private shared secret and bounded payload",()=>{
  assert.match(edge,/x-wonly-intake-secret/);
  assert.match(edge,/WEBSITE_INTAKE_SECRET/);
  assert.match(edge,/128\s*\*\s*1024/);
  assert.match(edge,/crypto\.subtle\.digest/);
});

test("marketing UI monitors failures and supports authorized retry",()=>{
  assert.match(html,/官网实时接入监控/);
  assert.match(html,/website_intake_attempts/);
  assert.match(html,/retry_website_intake/);
  assert.match(sql,/current_crm_role\(\) not in \('owner','sales_manager','marketing'\)/);
});

test("new acquisition choices exclude Feishu and include SEO",()=>{
  assert.doesNotMatch(html,/<option value="feishu">/);
  assert.match(html,/\["organic_search","SEO自然搜索"\]/);
});

test("email fallback extracts and stores UTM attribution",()=>{
  const parsed=parseWebsiteFormMessage({subject:"New WONLY Website Enquiry",sender_email:"notify@web3forms.com",body_text:`Name: Ada Lovelace\nEmail: ada@example.com\nUTM Source: google\nUTM Medium: cpc\nUTM Campaign: security-doors\nLanding Page: https://example.com/doors\nReferrer URL: https://google.com/`});
  assert.equal(parsed?.attribution?.utmSource,"google");
  assert.equal(parsed?.attribution?.utmMedium,"cpc");
  assert.equal(parsed?.attribution?.utmCampaign,"security-doors");
  assert.match(sync,/inquiry_marketing_touches/);
  assert.match(sync,/utm_source:a\.utmSource/);
});
