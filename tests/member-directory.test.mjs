import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function personalMailboxSettingsLabel('),html.indexOf('      async function loadModule('));
const label=vm.runInNewContext(source+';personalMailboxSettingsLabel');
test('personal mailbox settings distinguish connected, broken, disabled, missing and failed reads',()=>{
 assert.equal(label({status:'connected'}),'我的邮箱 · 已连接');
 assert.equal(label({status:'error'}),'我的邮箱 · 连接异常');
 assert.equal(label({status:'disabled'}),'我的邮箱 · 已停用');
 assert.equal(label(null),'连接我的邮箱');
 assert.equal(label(null,{message:'network'}),'我的邮箱 · 状态加载失败');
});
