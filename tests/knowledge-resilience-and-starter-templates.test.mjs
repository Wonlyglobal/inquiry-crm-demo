import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20260922173000_seed_chloe_business_email_templates.sql",import.meta.url),"utf8");

test("sales knowledge remains usable when the external material library is unavailable",()=>{
  assert.match(html,/materialError=materials\.error\|\|materials\.data\?\.error/);
  assert.match(html,/实时物料库加载失败，继续显示 CRM 销售知识/);
  assert.doesNotMatch(html,/if\(materials\.error\|\|materials\.data\?\.error\)return \{data:null,error:/);
});

test("role guide is forced to the final sidebar position at runtime",()=>{
  assert.match(html,/roleGuideNav\.parentElement\.appendChild\(roleGuideNav\)/);
});

test("Chloe receives at least ten idempotent, audited business templates",()=>{
  const names=[...migration.matchAll(/target_owner,'\d{2} · /g)];
  assert.ok(names.length>=10,`expected at least 10 templates, found ${names.length}`);
  assert.match(migration,/on conflict\(owner_id,name\) do nothing/i);
  assert.match(migration,/email_templates_seeded/);
  assert.match(migration,/lower\(email\)='chloelee@wonlyglobal\.com'/i);
});
