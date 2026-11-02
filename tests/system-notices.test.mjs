import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySystemNotice } from '../mail-sync/src/system-notices.mjs';
const notice = (subject,body_text='阿里邮箱安全通知',sender_email='no-reply@example.test',direction='inbound') => classifySystemNotice({subject,body_text,sender_email,direction});
test('provider notifications cannot become customer communication through contact or thread matches',()=>{
  assert.equal(notice('垃圾邮件提醒'),'junk_digest');
  assert.equal(notice('邮件退信'),'bounce');
  assert.equal(notice('阿里邮箱登录提醒'),'login_notice');
  assert.equal(notice('阿里邮箱提醒'),'provider_notice');
  assert.equal(notice('系统通知'),'provider_notice');
  assert.equal(notice('Undelivered Mail Returned to Sender','','mailer-daemon@example.test'),'bounce');
});
test('no-reply RFQs and human messages are not swallowed by the provider filter',()=>{
  assert.equal(notice('New inquiry via website','We need doors'),null);
  assert.equal(notice('系统采购需求','阿里邮箱'),null);
  assert.equal(notice('退信问题，请重新报价','','buyer@example.test'),null);
  assert.equal(notice('系统通知','ordinary purchase request'),null);
  assert.equal(notice('垃圾邮件提醒','','no-reply@example.test','outbound'),null);
});

test('Edge package exactly matches the reviewed mail service and locked import map',async()=>{
  const {readFile,readdir}=await import('node:fs/promises');
  const names=(await readdir(new URL('../mail-sync/src/',import.meta.url))).filter(n=>n.endsWith('.mjs'));
  for(const name of names)assert.equal(await readFile(new URL(`../supabase/functions/mail-sync-worker/runtime/${name}`,import.meta.url),'utf8'),await readFile(new URL(`../mail-sync/src/${name}`,import.meta.url),'utf8'));
  assert.equal(await readFile(new URL('../supabase/functions/mail-sync-worker/deno.json',import.meta.url),'utf8'),await readFile(new URL('../mail-sync/deno.json',import.meta.url),'utf8'));
});
