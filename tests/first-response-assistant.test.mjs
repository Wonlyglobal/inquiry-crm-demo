import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../supabase/migrations/20260918170000_first_response_assistant.sql",import.meta.url),"utf8");
const worker=readFileSync(new URL("../supabase/functions/mailbox-ai-draft/index.ts",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const rollback=readFileSync(new URL("./production-first-response-assistant-rollback.sql",import.meta.url),"utf8");

test("first-response plans are private draft metadata written only by the mail service",()=>{
  assert.match(sql,/add column if not exists response_plan jsonb not null default '\{\}'::jsonb/);
  assert.match(sql,/draft_response_plan jsonb/);
  assert.match(sql,/revoke all on function public\.record_email_ai_draft\([^;]+jsonb\) from public,anon,authenticated/s);
  assert.match(sql,/grant execute on function public\.record_email_ai_draft\([^;]+jsonb\) to service_role/s);
});

test("mail AI produces a bounded minimum-reply plan and persists it with the draft",()=>{
  assert.match(worker,/response_mode/);
  assert.match(worker,/minimum_first_response/);
  assert.match(worker,/acknowledged_items/);
  assert.match(worker,/clarifying_questions/);
  assert.match(worker,/do_not_promise/);
  assert.match(worker,/draft_response_plan:responsePlan/);
});

test("recommended timing is deterministic and based on customer country timezone",()=>{
  assert.match(worker,/countryTimeZones/);
  assert.match(worker,/recommendedSendWindow/);
  assert.match(worker,/customer_local_window/);
  assert.match(worker,/recommended_send_at/);
});

test("composer exposes first-response advice without auto-sending",()=>{
  assert.match(html,/id="mail-ai-minimum"/);
  assert.match(html,/id="mail-first-response-panel"/);
  assert.match(html,/renderMailResponsePlan/);
  assert.match(html,/data-apply-send-time/);
  assert.doesNotMatch(html,/mail-ai-minimum"[^>]*type="submit"/);
});

test("minimum reply still runs the existing fact-check gate",()=>{
  assert.match(html,/runMailboxAi\("reply",\{minimum:true\}\)/);
  assert.match(html,/mailAiDraftId=draft\.id;[\s\S]{0,180}mailFactCheckState=null;renderMailFactCheck\(\)/);
  assert.match(html,/await runMailFactCheck\(\)/);
});

test("production first-response acceptance is rollback-only",()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/FIRST_RESPONSE_PLAN_NOT_SAVED/);
  assert.match(rollback,/^rollback;/m);
});
