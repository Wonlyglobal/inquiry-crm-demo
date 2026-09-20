import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20260920090000_risk_review_center.sql',import.meta.url),'utf8');
const governance=await readFile(new URL('../../docs/CRM-SECURITY-RISK-GOVERNANCE-2026-09-20.md',import.meta.url),'utf8');

test('risk foundation uses explicit domains, severities and lifecycle',()=>{
  assert.match(migration,/domain in \('security','business'\)/);
  assert.match(migration,/severity in \('p0','p1','p2','p3'\)/);
  assert.match(migration,/status in \('open','contained','under_review','remediation','resolved','false_positive'\)/);
  assert.match(migration,/private\.risk_due_at/);
});

test('risk evidence and events are protected from direct browser writes',()=>{
  assert.match(migration,/revoke all on public\.risk_cases,public\.risk_case_events,public\.risk_user_controls from anon,authenticated/);
  assert.match(migration,/risk_case_events_immutable/);
  assert.match(migration,/风险事件为不可变审计记录/);
  assert.match(migration,/风险证据不得包含密码或密钥值/);
});

test('review enforces team scope, self-review avoidance and owner P0/P1 control',()=>{
  assert.match(migration,/销售主管只能处理本团队业务风险/);
  assert.match(migration,/风险涉及本人时必须转由上级审查/);
  assert.match(migration,/P0\/P1 风险的控制、解除和终审仅限老板/);
  assert.match(migration,/请先复验并解除活动限制/);
});

test('automatic business scan is deterministic, idempotent and never changes ownership',()=>{
  assert.match(migration,/business\.unassigned_inquiry/);
  assert.match(migration,/business\.first_response_overdue/);
  assert.match(migration,/business\.follow_up_overdue/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/risk_case_created/);
  assert.doesNotMatch(migration,/update public\.inquiries set owner_id/i);
});

test('governance distinguishes approved design from production state',()=>{
  assert.match(governance,/风险审查中心 \| 阶段 A 已发布生产/);
  assert.match(governance,/P0\/P1 自动控制 \| 生产部分启用/);
  assert.match(governance,/仅在前端禁用按钮不算完成控制/);
  assert.match(governance,/自动控制不得删除数据、修改客户归属/);
});

test('risk center is visible only to owner and sales manager in the app',()=>{
  const matrix=html.slice(html.indexOf('const roleViewAccess ='),html.indexOf('function canAccessView'));
  assert.match(matrix,/owner: new Set\([^\n]*"risk-review"/);
  assert.match(matrix,/sales_manager: new Set\([^\n]*"risk-review"/);
  assert.doesNotMatch(matrix,/marketing: new Set\([^\n]*"risk-review"/);
  assert.doesNotMatch(matrix,/sales: new Set\([^\n]*"risk-review"/);
});

test('risk UI uses server RPCs for scan, workspace and review',()=>{
  assert.match(html,/get_my_risk_review_workspace/);
  assert.match(html,/run_crm_risk_scan/);
  assert.match(html,/review_risk_case/);
  assert.match(html,/风险审查中心/);
});
