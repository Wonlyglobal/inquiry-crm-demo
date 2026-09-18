import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('every signed-in role gets a visible change-password entry',()=>{
  assert.match(html,/id="change-password"[^>]*>修改密码</);
  assert.match(html,/#change-password"\)\.addEventListener\("click", \(\) => openPasswordResetRequest\("account"\)\)/);
});

test('signed-in password changes are verified through the bound company email',()=>{
  assert.match(html,/const email = accountChange \? \(currentAuthUser\?\.email \|\| profile\?\.email \|\| ""\)/);
  assert.match(html,/#forgot-password-email"\)\.readOnly = accountChange/);
  assert.match(html,/passwordResetSource === "account"[\s\S]*?currentAuthUser\?\.email \|\| profile\?\.email/);
  assert.match(html,/supabase\.auth\.resetPasswordForEmail\(email/);
  assert.match(html,/点击邮件中的链接后才能设置新密码/);
});

test('verified recovery session is still required before password update',()=>{
  assert.match(html,/event === "PASSWORD_RECOVERY"/);
  assert.match(html,/passwordChangeMode = "recovery"/);
  assert.match(html,/supabase\.auth\.updateUser\(\{ password: a \}\)/);
});

test('role guide announces the password verification release',()=>{
  assert.match(html,/at:"2026-09-18 14:31",title:"修改密码增加邮箱验证"/);
});
