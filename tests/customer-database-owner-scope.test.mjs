import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../supabase/migrations/20260910200000_scope_customer_database_to_current_owner.sql",import.meta.url),"utf8");
const documentSql=await readFile(new URL("../supabase/migrations/20260911043447_customer_documents.sql",import.meta.url),"utf8");
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");

test("sales inquiry visibility follows current ownership rather than original creator",()=>{
  assert.match(sql,/create policy inquiries_read[\s\S]*owner_id=\(select auth\.uid\(\)\)/i);
  const inquiryPolicy=sql.match(/create policy inquiries_read[\s\S]*?;\n/i)?.[0]||"";
  assert.doesNotMatch(inquiryPolicy,/created_by/);
});

test("company and contact visibility follows a currently owned inquiry",()=>{
  assert.match(sql,/create policy companies_read[\s\S]*i\.owner_id=\(select auth\.uid\(\)\)/i);
  assert.match(sql,/create policy contacts_read[\s\S]*i\.owner_id=\(select auth\.uid\(\)\)/i);
});

test("orphan records remain visible only while the atomic creation flow is unfinished",()=>{
  assert.match(sql,/created_by=\(select auth\.uid\(\)\)[\s\S]*not exists\(select 1 from public\.inquiries/i);
});

test("contact writes cannot use original creator access after an inquiry exists",()=>{
  assert.match(sql,/create policy contacts_insert[\s\S]*c\.created_by=\(select auth\.uid\(\)\)[\s\S]*not exists\(select 1 from public\.inquiries/i);
  assert.match(sql,/create or replace function public\.add_customer_contact[\s\S]*c\.created_by=actor_id[\s\S]*not exists\(select 1 from public\.inquiries/i);
});

test("customer record exposes communications, quotations and audited contact creation",()=>{
  assert.match(html,/async function openCustomerRecord\(companyId\)/);
  assert.match(html,/from\("email_messages"\)\.select\("id,inquiry_id,direction/);
  assert.match(html,/from\("quotation_versions"\)\.select\("id,inquiry_id,quote_no/);
  assert.match(html,/id="customer-contact-form"/);
  assert.match(html,/supabase\.rpc\("add_customer_contact"/);
  assert.match(html,/联系人已保存并完成审计留痕/);
  assert.match(html,/客户文件（合同 \/ PI \/ 成交凭证 \/ 邮件附件）/);
  assert.match(html,/data-customer-document-bucket/);
  assert.match(html,/createSignedUrl\(button\.dataset\.customerDocument/);
});

test("customer record checks related query errors only after results are declared",()=>{
  const openStart=html.indexOf("async function openCustomerRecord(companyId)");
  const openEnd=html.indexOf("      const knowledgeCategoryNames",openStart);
  const source=html.slice(openStart,openEnd);
  const declaration=source.indexOf("documentsResult]");
  const errorCheck=source.indexOf("relatedError");
  assert.ok(declaration>=0,"customer document query should declare its result");
  assert.ok(errorCheck>declaration,"related errors must be checked after query results are declared");
  assert.doesNotMatch(source.slice(0,declaration),/documentsResult\.error/);
});

test("customer record paginates all related history and documents",()=>{
  assert.match(html,/async function loadAllCustomerRows\(queryFactory, pageSize = 500\)/);
  assert.match(html,/loadAllCustomerRows\(\(\)=>supabase\.from\("email_messages"\)/);
  assert.match(html,/loadAllCustomerRows\(\(\)=>supabase\.from\("quotation_versions"\)/);
  assert.match(html,/loadAllCustomerRows\(\(\)=>supabase\.from\("customer_documents"\)/);
  assert.match(html,/loadAllCustomerRows\(\(\)=>supabase\.from\("email_attachments"\)/);
});

test("customer documents are private, owner-scoped and auditable",()=>{
  assert.match(documentSql,/create table if not exists public\.customer_documents/);
  assert.match(documentSql,/alter table public\.customer_documents enable row level security/);
  assert.match(documentSql,/customer_documents_select[\s\S]*i\.owner_id=\(select auth\.uid\(\)\)/);
  assert.match(documentSql,/customer-documents/);
  assert.match(html,/from\("customer_documents"\)\.select/);
  assert.match(html,/customer_document_uploaded/);
});
