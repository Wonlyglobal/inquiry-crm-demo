// A dedicated application document generated from the shared runtime so Grace
// uses the exact same auth, model, materials and local-analysis implementation.
import {readFile,writeFile} from 'node:fs/promises';
export function graceDocument(source){
 return source.replace('<html lang="zh-CN">','<html lang="zh-CN" data-grace-app="true" data-grace-entry="true">')
 .replace('<title>王力 · 全球询盘 CRM</title>','<title>Grace · 王力随身 AI</title>')
 .replace(/[ \t]*<aside class="login-showcase"[\s\S]*?<\/aside>/,'')
 .replace('正在进入询盘 CRM…','Grace 正在准备…')
 .replace('<div class="brand-mark" title="全球询盘"><i data-lucide="messages-square"></i></div>','<div class="brand-mark" title="Grace"><span class="grace-login-eyes"><i></i><i></i></span></div>')
 .replace('<h1>全球询盘 CRM</h1>','<h1>你好，我是 Grace</h1>')
 .replace('使用公司邮箱登录。首次登录后必须修改初始密码。','登录后，继续我们的对话。');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
 await writeFile(new URL('../grace.html',import.meta.url),graceDocument(source));
}
