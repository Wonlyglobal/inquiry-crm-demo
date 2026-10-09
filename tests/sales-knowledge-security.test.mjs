import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260910043000_sales_knowledge_and_data_quality.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rollback=fs.readFileSync(new URL('./production-sales-knowledge-rollback.sql',import.meta.url),'utf8');

test('sales knowledge is readable by active staff and writable only by content managers',()=>{
  assert.match(sql,/create policy sales_knowledge_read[\s\S]+p\.active=true/);
  assert.match(sql,/sales_knowledge_manage_insert[\s\S]+created_by=\(select auth\.uid\(\)\)[\s\S]+\('owner','sales_manager','marketing'\)/);
  assert.match(sql,/sales_knowledge_manage_update[\s\S]+\('owner','sales_manager','marketing'\)/);
  assert.match(sql,/revoke all on public\.sales_knowledge_articles,public\.data_quality_alerts from anon/);
});

test('knowledge changes preserve authorship and produce durable audit evidence',()=>{
  assert.match(sql,/if new\.created_by is distinct from old\.created_by then raise exception '不能变更创建人'/);
  assert.match(sql,/create trigger sales_knowledge_audit after insert or update/);
  assert.match(sql,/'销售知识库内容变更'/);
});

test('knowledge UI searches complete persisted content and inserts it into the composer',()=>{
  assert.match(html,/loadModuleRowsPaged\(\(from,to\)=>supabase\.from\("sales_knowledge_articles"\)/);
  assert.match(html,/meta:\{searchText:`\$\{item\.content\|\|""\} \$\{item\.uploaderName\|\|""\}`,[^}]*knowledgeKind:"article"/);
  assert.match(html,/id="knowledge-insert-mail"/);
  assert.match(html,/body\.value=`\$\{body\.value\}\$\{separator\}\$\{article\.content\}`/);
  assert.match(html,/view==="knowledge"&&!\['owner','marketing'\]\.includes\(profile\.role\)/);
});

test('production sales knowledge acceptance check is rollback-only',()=>{
  assert.match(rollback,/^begin;/m);
  assert.match(rollback,/KNOWLEDGE_AUDIT_NOT_RECORDED/);
  assert.match(rollback,/SALES_KNOWLEDGE_WRITE_NOT_BLOCKED/);
  assert.match(rollback,/^rollback;/m);
});
