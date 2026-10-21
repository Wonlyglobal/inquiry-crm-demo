import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseWebsiteFormMessage} from "../mail-sync/src/website-form.mjs";

const sql=await readFile(new URL("../supabase/migrations/20260910101733_website_intake_attribution.sql",import.meta.url),"utf8");
const edge=await readFile(new URL("../supabase/functions/website-inquiry-intake/index.ts",import.meta.url),"utf8");
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const sync=await readFile(new URL("../mail-sync/src/index.mjs",import.meta.url),"utf8");
const imageFunction=await readFile(new URL("../supabase/functions/company-website-images/index.ts",import.meta.url),"utf8");
const companyIdentityMigration=await readFile(new URL("../supabase/migrations/20261021110000_website_company_identity_from_body.sql",import.meta.url),"utf8");

test("website intake is idempotent, monitored and keeps service credentials server-side",()=>{
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
  assert.match(edge,/SUPABASE_PUBLISHABLE_KEY/);
  assert.match(edge,/SUPABASE_ANON_KEY/);
  assert.match(edge,/access-control-allow-origin/);
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

test("Web3Forms remains provider metadata; company identity comes only from explicit body fields",()=>{
  const providerNamed=parseWebsiteFormMessage({subject:"New WONLY Website Enquiry",sender_email:"notify@web3forms.com",body_text:"Name: Jane Doe\nCompany: Web3Forms\nEmail: jane@realbuyer.example\nMessage: Please quote 200 doors"});
  assert.equal(providerNamed.companyName,"");
  assert.equal(providerNamed.companyDomain,null);
  const bodyCompany=parseWebsiteFormMessage({subject:"New WONLY Website Enquiry",sender_email:"notify@web3forms.com",body_text:"Name: Jane Doe\nCompany: Real Buyer Ltd\nCompany Website: https://realbuyer.example\nEmail: jane@gmail.com\nMessage: Please quote 200 doors"});
  assert.equal(bodyCompany.companyName,"Real Buyer Ltd");
  assert.equal(bodyCompany.companyDomain,"realbuyer.example");
  const noBodyCompany=parseWebsiteFormMessage({subject:"New WONLY Website Enquiry",sender_email:"notify@web3forms.com",body_text:"Name: Jane Doe\nEmail: jane@realbuyer.example\nMessage: Please quote 200 doors"});
  assert.equal(noBodyCompany.companyName,"");
  assert.equal(noBodyCompany.companyDomain,null);
  assert.equal(parseWebsiteFormMessage({subject:"New WONLY Website Enquiry",sender_email:"notify@web3forms.com",body_text:"Name: Jane Doe\nEmail: jane@web3forms.com\nMessage: hello"}),null);
  assert.match(sync,/const companyName=websiteForm\?\.companyName\|\|null/);
  assert.match(sync,/if\(!companyId&&companyName\)/);
  assert.match(sync,/if\(companyId\)\{/);
  assert.match(edge,/isWebformProvider\(payload\[field\]\)/);
  assert.match(imageFunction,/hostname === "web3forms\.com" \|\| hostname\.endsWith\("\.web3forms\.com"\)/);
  assert.match(companyIdentityMigration,/payload->>''website_url''/);
  assert.match(companyIdentityMigration,/company_id_value is null and company_name is not null/);
  assert.match(companyIdentityMigration,/contact_id_value is null and company_id_value is not null/);
  assert.match(companyIdentityMigration,/not exists\(select 1 from public.contacts c where lower\(c.email\)=customer_email\)/);
  assert.match(html,/webformProviderIdentityBlocked/);
  assert.match(html,/Web3Forms 是官网表单服务商/);
});

test("smart organizer recognizes International Sales & Business Development",()=>{
  const functionSource=html.match(/function organizeInquiryText\(inquiry\) \{[\s\S]*?\n      \}/)?.[0];
  assert.ok(functionSource,"organizeInquiryText should remain locally testable");
  const organize=new Function(`${functionSource}; return organizeInquiryText;`)();
  const result=organize({original_message:"Name: Ehtesham Uddin Ahmed\nInternational Sales & Business Development\nPlease quote door locks",email_intake:{sender_email:"ehtesham@example.com",parsed_data:{}}});
  assert.equal(result.title,"International Sales & Business Development");
});
