import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const edge=await readFile(new URL("../supabase/functions/material-library/index.ts",import.meta.url),"utf8");

test("sales knowledge merges live material records with CRM articles",()=>{
  assert.match(html,/supabase\.functions\.invoke\("material-library",\{body:\{action:"list"/);
  assert.match(html,/knowledgeSource:"material"/);
  assert.match(html,/物料库 · 实时/);
  assert.match(html,/查看 \/ 添加附件/);
});

test("mail composer preserves local and material attachments under one limit",()=>{
  assert.match(html,/id="mail-select-material"/);
  assert.match(html,/selectedMaterialAttachments/);
  assert.match(html,/material_asset_ids:selectedMaterialAttachments\.map/);
  assert.match(html,/files\.length\+selectedMaterialAttachments\.length>MAIL_ATTACHMENT_COUNT_LIMIT/);
  assert.doesNotMatch(html,/action:"download",asset_id:item\.id/);
  assert.match(html,/MAIL_ATTACHMENT_LIMIT_BYTES=50\*1024\*1024,MAIL_ATTACHMENT_COUNT_LIMIT=100/);
  assert.match(html,/remainingBytes=Math\.max\(0,MAIL_ATTACHMENT_LIMIT_BYTES/);
  assert.match(html,/文件超过普通附件 50MB 上限/);
  assert.match(html,/一键压缩附件/);
  assert.match(html,/disabled title=/);
});

test("邮件发送函数在服务端读取实时物料附件",async()=>{
  const send=await readFile(new URL("../supabase/functions/mailbox-compose-send/index.ts",import.meta.url),"utf8");
  assert.match(send,/loadMaterialAttachment/);
  assert.match(send,/MATERIAL_LIBRARY_SECRET/);
  assert.match(send,/material_asset_ids/);
  assert.match(send,/X-CRM-User-ID/);
});

test("material proxy authenticates CRM users and keeps the integration secret server-side",()=>{
  assert.match(edge,/auth\.getUser\(\)/);
  assert.match(edge,/allowedRoles/);
  assert.match(edge,/MATERIAL_LIBRARY_SECRET/);
  assert.doesNotMatch(html,/MATERIAL_LIBRARY_SECRET|CRM_INTEGRATION_SECRET/);
  assert.match(edge,/bytes\.length>50\*1024\*1024/);
  assert.match(edge,/material_attachment_loaded/);
});
