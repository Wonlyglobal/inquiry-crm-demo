import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const sql=await readFile(new URL("../supabase/migrations/20260915120000_harden_outcome_approval_integrity.sql",import.meta.url),"utf8");
const rollback=await readFile(new URL("./production-outcome-approval-rollback.sql",import.meta.url),"utf8");

test("won and lost statuses cannot bypass the audited approval workflows",()=>{
  assert.match(sql,/not rpc_change and new\.status is distinct from old\.status[\s\S]*new\.status in \('won','lost'\)/);
  assert.match(sql,/成交或丢单必须通过申请与主管审批流程/);
  assert.match(sql,/成交金额、币种、汇率和成交时间必须通过审批流程修改/);
  assert.match(sql,/sample_sent/);
  assert.doesNotMatch(sql,/\bsampled\b/);
});

test("won requests require a delivered approved quotation",()=>{
  assert.match(sql,/item\.status not in \('quoted','sample_sent','negotiating'\)/);
  assert.match(sql,/q\.status='sent' and q\.sent_at is not null/);
  assert.match(sql,/成交申请前必须存在已审批并发送客户的报价/);
});

test("manager review rejects stale ownership or closed opportunities",()=>{
  assert.match(sql,/if approve then[\s\S]*商机已关闭或不再有效，不能审批该成交申请/);
  assert.match(sql,/item\.owner_id is distinct from req\.requested_by[\s\S]*重新提交成交申请/);
  assert.match(sql,/if approve then[\s\S]*商机已关闭或不再有效，不能审批该丢单申请/);
  assert.match(sql,/item\.owner_id is distinct from req\.requested_by[\s\S]*重新提交丢单申请/);
});

test("production acceptance check is rollback-only",()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/status='won'/);
  assert.match(rollback,/status='lost'/);
  assert.match(rollback,/成交或丢单必须通过申请与主管审批流程/);
  assert.match(rollback,/^rollback;/m);
});
