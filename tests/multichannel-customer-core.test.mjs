import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/20260922190000_multichannel_customer_opportunity.sql',import.meta.url),'utf8');

test('customer creation is one audited server transaction with role-aware ownership',()=>{
  assert.match(sql,/create or replace function public\.create_customer_opportunity/i);
  assert.match(sql,/actor\.role not in \('owner','marketing','sales'\)/);
  assert.match(sql,/assigned_owner:=case when actor\.role='sales' then actor\.id else null end/);
  assert.match(sql,/created_status:=case when actor\.role='sales' then 'received'.*else 'pending_assignment'/s);
  assert.match(sql,/multichannel_customer_opportunity_created/);
  assert.match(sql,/revoke all on function public\.create_customer_opportunity[\s\S]*from public,anon/i);
  assert.match(html,/supabase\.rpc\("create_customer_opportunity"/);
  const clientFlow=html.slice(html.indexOf('      async function createInquiry({'),html.indexOf('      function parseMail('));
  assert.doesNotMatch(clientFlow,/\.from\("companies"\)\s*\.insert|\.from\("contacts"\)\s*\.insert|\.from\("inquiries"\)\s*\.insert/);
});

test('all approved manual customer channels and minimum fields are exposed',()=>{
  for(const channel of ['whatsapp','wechat','phone','exhibition','website','email','social_media','offline_visit','dealer_referral','customer_referral','internal_referral','outbound','other']){
    assert.match(html,new RegExp(`option value=["']${channel}["']`));
    assert.match(sql,new RegExp(`'${channel}'`));
  }
  assert.match(html,/邮箱、电话、WhatsApp 至少填写一项/);
  assert.match(sql,/请至少填写邮箱、电话或 WhatsApp 中的一项联系方式/);
  assert.match(sql,/客户可能已由其他业务员负责，请提交主管核查归属/);
});

test('customer management presents company contact and opportunity layers',()=>{
  assert.match(html,/id="customer-core"/);
  assert.match(html,/function renderCustomerCore\(companies=\[\],contacts=\[\],inquiries=\[\]\)/);
  assert.match(html,/<h3>公司<\/h3>/);
  assert.match(html,/<h3>联系人<\/h3>/);
  assert.match(html,/<h3>商机<\/h3>/);
  assert.match(html,/\+ 新建客户 \/ 商机/);
});

test('inquiry pipeline expands in the list instead of using a deep detail tab',()=>{
  assert.match(html,/function toggleInquiryPipelinePreview/);
  assert.match(html,/label:"展开流水线"/);
  assert.match(html,/detail\.className="pipeline-dropdown-row"/);
  assert.doesNotMatch(html,/data-detail-tab="pipeline"/);
});
