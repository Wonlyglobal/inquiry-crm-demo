import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sql=await readFile(new URL("../supabase/migrations/20260918160000_company_research_monitor.sql",import.meta.url),"utf8");
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const rollback=await readFile(new URL("./production-company-research-monitor-rollback.sql",import.meta.url),"utf8");

test("new inquiries queue a background research monitor job",()=>{
  assert.match(sql,/create table if not exists public\.company_research_jobs/);
  assert.match(sql,/create trigger inquiries_queue_company_research/);
  assert.match(sql,/after insert or update of company_id,target_country,contact_id/);
  assert.match(sql,/process-company-research-monitor-jobs/);
  assert.match(sql,/\*\/5 \* \* \* \*/);
  assert.match(sql,/not exists\(select 1 from public\.company_research_jobs existing/);
});

test("monitor records freshness and evidence gaps without rewriting research facts",()=>{
  assert.match(sql,/interval '90 days'/);
  assert.match(sql,/evidence_count/);
  assert.match(sql,/research_health=monitor_result/);
  assert.match(sql,/set status='failed',attempts=attempts\+1/);
  assert.doesNotMatch(sql,/set confirmed_facts=/);
  assert.doesNotMatch(sql,/set demand_signals=/);
});

test("monitor detects country and business-domain conflicts",()=>{
  assert.match(sql,/\('type','country'/);
  assert.match(sql,/\('type','domain'/);
  assert.match(sql,/询盘国家\/地区与公司背调国家不一致/);
  assert.match(sql,/联系人企业邮箱域名与公司域名不一致/);
});

test("manual refresh enforces active-user and inquiry ownership boundaries",()=>{
  assert.match(sql,/actor_id uuid:=auth\.uid\(\)/);
  assert.match(sql,/private\.current_crm_role\(\) not in \('owner','sales_manager','marketing'\) and inquiry\.owner_id<>actor_id/);
  assert.match(sql,/revoke all on function public\.refresh_inquiry_research_monitor\(uuid\) from public,anon/);
});

test("research page displays freshness conflicts and a review-only refresh action",()=>{
  assert.match(html,/背调新鲜度与冲突监控/);
  assert.match(html,/refresh-research-monitor/);
  assert.match(html,/refresh_inquiry_research_monitor/);
  assert.match(html,/不会自动覆盖已确认事实/);
});

test("production acceptance is rollback-only and proves confirmed evidence is unchanged",()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/private\.assess_company_research\(job_id\)/);
  assert.match(rollback,/confirmed_facts is distinct from before_facts/);
  assert.match(rollback,/demand_signals is distinct from before_signals/);
  assert.match(rollback,/^rollback;/m);
});
