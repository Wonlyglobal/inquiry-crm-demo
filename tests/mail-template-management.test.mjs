import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('my mailbox has a dedicated personal template tab',()=>{
  assert.match(html,/data-mailbox-folder="templates">我的模板/);
  assert.match(html,/mailboxFolder==="templates"/);
  assert.match(html,/我的邮件模板/);
});

test('personal templates support create edit and delete with owner scoping',()=>{
  assert.match(html,/function openMailTemplateEditor/);
  assert.match(html,/function deleteMailTemplate/);
  assert.match(html,/\.eq\("owner_id",profile\.id\)/);
  assert.match(html,/label:"编辑"/);
  assert.match(html,/label:"删除"/);
});

test('all buttons receive consistent interaction and focus treatment',()=>{
  assert.match(html,/button:not\(:disabled\) \{ cursor: pointer; \}/);
  assert.match(html,/button:focus-visible/);
  assert.match(html,/\.primary:not\(:disabled\):hover/);
});
