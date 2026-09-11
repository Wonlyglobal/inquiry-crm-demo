import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('personal templates have a dedicated sidebar page',()=>{
  assert.match(html,/data-view="templates"[\s\S]*?<span>我的模板<\/span>/);
  assert.match(html,/templates:\s*\["我的模板"/);
  assert.match(html,/activeModuleView==="templates"/);
  assert.doesNotMatch(html,/data-mailbox-folder="templates"/);
  assert.match(html,/我的邮件模板/);
});

test('personal templates support create edit and delete with owner scoping',()=>{
  assert.match(html,/function openMailTemplateEditor/);
  assert.match(html,/function deleteMailTemplate/);
  assert.match(html,/\.eq\("owner_id",profile\.id\)/);
  assert.match(html,/label:"编辑"/);
  assert.match(html,/label:"删除"/);
});

test('mail history and personal templates use complete paginated lists',()=>{
  assert.match(html,/query = loadModuleRowsPaged\(\(from,to\)=>supabase\.from\("email_intake"\)/);
  assert.match(html,/loadModuleRowsPaged\(\(from,to\)=>supabase\.from\("email_messages"\)/);
  assert.match(html,/query=loadModuleRowsPaged\(\(from,to\)=>supabase\.from\("email_templates"\)/);
  assert.match(html,/query=loadModuleRowsPaged\(\(from,to\)=>supabase\.from\("mail_outbox"/);
});

test('all buttons receive consistent interaction and focus treatment',()=>{
  assert.match(html,/button:not\(:disabled\) \{ cursor: pointer; \}/);
  assert.match(html,/button:focus-visible/);
  assert.match(html,/\.primary:not\(:disabled\):hover/);
});
