import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("../supabase/functions/mailbox-draft-fact-check/index.ts",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const config=readFileSync(new URL("../supabase/config.toml",import.meta.url),"utf8");
const sender=readFileSync(new URL("../supabase/functions/mailbox-compose-send/index.ts",import.meta.url),"utf8");

test("fact checker authenticates and limits customer-email access",()=>{
  assert.match(worker,/auth\.getUser\(\)/);
  assert.match(worker,/\["sales","sales_manager","owner"\]\.includes\(profile\.role\)/);
  assert.match(worker,/inquiry\.owner_id!==user\.id&&!\["owner","sales_manager"\]/);
  assert.match(worker,/email_ai_drafts[\s\S]*author_id/);
  assert.match(worker,/withReadOnlyGuard/);
});

test("fact checker uses authoritative evidence and validates exact quotes",()=>{
  assert.match(worker,/COMPLETE EMAIL THREAD/);
  assert.match(worker,/CONFIRMED COMPANY DATA/);
  assert.match(worker,/APPROVED OR SENT QUOTATIONS/);
  assert.match(worker,/\.in\("status",\["approved","sent"\]\)/);
  assert.match(worker,/sources\.includes\(quote\)/);
  assert.match(worker,/status==="supported"&&!verified\?"uncertain"/);
});

test("high-risk unsupported claims deterministically block and are audited",()=>{
  assert.match(worker,/item\.status!=="supported"&&item\.severity==="high"/);
  assert.match(worker,/verdict=highRisk\?"block":unsupported\?"warning":"pass"/);
  assert.match(worker,/target_suggestion_type:"email_draft_fact_check"/);
  assert.match(worker,/target_target_type:"inquiry"/);
  assert.match(worker,/sourceHash=await sha256/);
  assert.match(worker,/draft_content_hash:draftContentHash/);
  assert.match(sender,/email_draft_fact_check/);
  assert.match(sender,/checked\.draft_content_hash!==contentHash/);
  assert.match(sender,/checked\.verdict==="block"/);
});

test("composer auto-checks AI drafts, invalidates edits and gates send",()=>{
  assert.match(html,/id="mail-fact-check-panel"/);
  assert.match(html,/mailAiDraftId=draft\.id;mailFactCheckState=null;renderMailFactCheck\(\);/);
  assert.match(html,/await runMailFactCheck\(\)/);
  assert.match(html,/\["#mail-compose-subject","#mail-compose-body"\][\s\S]*invalidateMailFactCheck/);
  assert.match(html,/const factCheck=await runMailFactCheck\(\{silent:true\}\)/);
  assert.match(html,/mailAiDraftId&&!factCheck\.ok/);
  assert.match(html,/scheduledAt&&mailAiDraftId/);
});

test("new function supports current signing-key gateway setup",()=>{
  assert.match(config,/\[functions\.mailbox-draft-fact-check\]\s+verify_jwt = false/);
});
