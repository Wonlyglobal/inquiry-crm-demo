import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20260918130000_role_function_overlap_optimization.sql',import.meta.url),'utf8');
const decisions=await readFile(new URL('../DECISIONS.md',import.meta.url),'utf8');
const rollback=await readFile(new URL('./production-role-function-overlap-rollback.sql',import.meta.url),'utf8');

test('one central role matrix removes duplicated daily execution menus',()=>{
  const matrix=html.slice(html.indexOf('const roleViewAccess ='),html.indexOf('function canAccessView'));
  assert.match(matrix,/sales_manager: new Set\(\["dashboard","inquiries","customers","whatsapp","knowledge","sop","communications","assignment","public-pool","daily","performance-360"\]\)/);
  assert.match(matrix,/marketing: new Set\(\["dashboard","marketing-center","inquiries","customers","knowledge","sop","email","nurture","research","performance-360"\]\)/);
  assert.match(matrix,/sales: new Set\(\["dashboard","sales-today","follow-calendar","inquiries","customers","mailbox","whatsapp","templates","knowledge","sop","quotes","fulfillment","public-pool","daily","performance-360"\]\)/);
  assert.match(html,/if \(!canAccessView\(view\)\) \{[\s\S]*?当前角色无权进入该功能/);
});

test('dead configuration and assignment entry points are role gated',()=>{
  assert.match(html,/view==="whatsapp"&&!\['owner','sales_manager'\]\.includes\(profile\.role\)/);
  assert.match(html,/if\(!\["owner","sales_manager"\]\.includes\(profile\?\.role\)\)return toast\("仅老板或销售主管可查看推荐并完成分配"\)/);
  assert.match(html,/公共邮箱状态/);
  assert.doesNotMatch(html,/id="marketing-open-assignment"/);
  assert.match(html,/const canManageSharedInquiry = profile\.role === "owner"/);
});

test('market hand-off becomes read only for commercial customer data',()=>{
  assert.match(html,/marketHasAssigned=profile\.role==="marketing"&&inquiries\.some\(item=>item\.owner_id\)/);
  assert.match(html,/profile\.role!=="marketing"\?loadAllCustomerRows\(\(\)=>supabase\.from\("customer_documents"\)/);
  assert.match(html,/canManageDocuments=profile\.role==="owner"\|\|\(profile\.role==="sales"&&ownedInquiry\)/);
  assert.match(html,/profile\?\.role!=="marketing"\|\|!currentInquiry\?\.owner_id/);
  assert.match(html,/profile\?\.role==="marketing"\)return currentInquiry\?\.owner_id\?new Set\(\):new Set\(\["identity","need","fit"\]\)/);
  assert.match(html,/marketHiddenDetailTabs=profile\.role==="marketing"[\s\S]*?"outreach","pipeline","followup"[\s\S]*?"contact-policy","qualification","audit"/);
  assert.match(html,/reply-inquiry"\)\.classList\.toggle\("hidden",!\["owner","sales"\]\.includes\(profile\.role\)\)/);
});

test('database policies enforce the same separation instead of relying on hidden buttons',()=>{
  assert.match(migration,/email_messages_read_visible[\s\S]*private\.current_crm_role\(\)='marketing' and i\.owner_id is null/);
  assert.match(migration,/quotation_versions_read[\s\S]*private\.current_crm_role\(\)='marketing' and i\.owner_id is null/);
  assert.match(migration,/outreach_drafts_insert[\s\S]*private\.current_crm_role\(\)='owner'[\s\S]*private\.current_crm_role\(\)='sales'/);
  assert.doesNotMatch(migration,/outreach_drafts_insert[\s\S]{0,450}(sales_manager|marketing)/);
  assert.match(migration,/customer_documents_select[\s\S]*private\.current_crm_role\(\) in \('owner','sales_manager'\)[\s\S]*private\.current_crm_role\(\)='sales'/);
  assert.match(migration,/customer_documents_insert[\s\S]*private\.current_crm_role\(\)='owner'[\s\S]*private\.current_crm_role\(\)='sales'/);
  assert.doesNotMatch(migration,/customer_documents_insert[\s\S]{0,400}sales_manager/);
  assert.match(migration,/actor_role='marketing' and item\.owner_id is not null/);
  assert.match(migration,/private\.current_crm_role\(\) not in \('owner','marketing'\).*?maintain nurture|private\.current_crm_role\(\) not in \('owner','marketing'\)/s);
  assert.match(migration,/private\.current_crm_role\(\)<>'owner'.*?历史工程/s);
  assert.match(migration,/sales_knowledge_manage_insert[\s\S]*in \('owner','marketing'\)/);
  assert.match(migration,/销售主管仅处理有效性争议复核/);
});

test('business decisions record the audited responsibility boundary',()=>{
  assert.match(decisions,/市场部在分配前维护原始联系人和来源/);
  assert.match(decisions,/分配后默认只读营销归因与结果/);
  assert.match(decisions,/市场部.*首次有效性判断/);
});

test('production acceptance proves both blocked and retained duties without residue',()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/MARKETING_ASSIGNED_INQUIRY_WRITE_ALLOWED/);
  assert.match(rollback,/MANAGER_DIRECT_INQUIRY_WRITE_ALLOWED/);
  assert.match(rollback,/MANAGER_QUALIFICATION_WORKFLOW_FAILED/);
  assert.match(rollback,/MANAGER_DOCUMENT_UPLOAD_ALLOWED/);
  assert.match(rollback,/sales-rollback-proof\.txt/);
  assert.match(rollback,/^rollback;/m);
  assert.match(rollback,/rollback_audits=/);
  assert.match(rollback,/rollback_documents=/);
});
