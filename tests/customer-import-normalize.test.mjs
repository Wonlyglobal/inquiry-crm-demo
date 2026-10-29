import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCustomerImports,importEmailCandidates} from '../assets/customer-import-normalize.mjs';
const base={row_number:2,company:'Example',demand:'门锁采购需求',source:'outbound',email:'a@example.com',source_detail:'展会原备注'};
test('Chinese channel names map without losing original customer data',()=>{
 const input={...base,source:'展会'};const {rows,warnings}=normalizeCustomerImports([input]);
 assert.equal(rows[0].source,'exhibition');assert.equal(warnings.length,0);assert.equal(input.source,'展会');
});
test('customer types are preserved and never fabricated as a known acquisition channel',()=>{
 const {rows,warnings}=normalizeCustomerImports([{...base,source:'进口商 / 分销商'}]);
 assert.equal(rows[0].source,'other');assert.match(rows[0].source_detail,/进口商 \/ 分销商/);assert.match(rows[0].source_detail,/待确认/);assert.equal(warnings.length,1);
 assert.throws(()=>normalizeCustomerImports([{...base,source:'随意的未知内容'}]),/来源渠道无法识别/);
});
test('concatenated and separated email candidates preserve all originals for confirmation',()=>{
 for(const raw of ['a@example.comb@example.net','a@example.ae b@example.com.kw','Normal Doors a@example.com. Safe Room- b@example.com']){
 const {rows,warnings}=normalizeCustomerImports([{...base,email:raw}]);
 assert.equal(rows[0].email,raw.startsWith('Normal')?'a@example.com':raw.includes('.ae')?'a@example.ae':'a@example.com');
 assert.match(rows[0].source_detail,/原邮箱单元格/);assert.ok(rows[0].source_detail.includes(raw));assert.equal(warnings.length,1);
 }
 assert.deepEqual(importEmailCandidates('a@example.coma@example.com'),['a@example.com']);
});
test('unknown single suffixes and blanks remain supported, malformed cells and overflow block',()=>{
 for(const email of ['a@example.technology','a@example.company'])assert.equal(normalizeCustomerImports([{...base,email}]).rows[0].email,email);
 assert.equal(normalizeCustomerImports([{...base,email:''}]).rows[0].email,'');
 assert.throws(()=>normalizeCustomerImports([{...base,email:'不是邮箱'}]),/未能识别/);
 assert.throws(()=>normalizeCustomerImports([{...base,source:'制造商',source_detail:'x'.repeat(1000)}]),/不会截断/);
});
test('both import previews normalize before confirmation and keep the existing atomic RPC',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const name of ['index.html','grace.html']){
  const html=await readFile(new URL('../'+name,import.meta.url),'utf8');
  const block=html.slice(html.indexOf('      async function previewCustomerImport(file)'),html.indexOf('      async function loadModule(view'));
  assert.ok(block.indexOf('normalizeCustomerImports(parseCustomerCsv')<block.indexOf('await appConfirm'));
  assert.match(block,/兼容处理（请逐条确认）/);
  assert.match(block,/warnings.join/);
  assert.match(block,/supabase.rpc\("import_customer_opportunities",\{import_rows:rows,source_file:file.name\}\)/);
  assert.match(block,/if\(!confirmed\)return/);
 }
});
test('customer type is optional and missing acquisition channels remain explicitly unconfirmed',()=>{
 const noType=normalizeCustomerImports([{...base,source:''}]);
 assert.equal(noType.rows[0].source,'other');assert.match(noType.rows[0].source_detail,/待确认/);
 const hasType=normalizeCustomerImports([{...base,company_type:'代理商'}]);
 assert.match(hasType.rows[0].source_detail,/客户类型（选填，原文件）：代理商/);
 assert.equal(hasType.rows[0].source,'outbound');
});
test('prospecting tool and Google labels retain their meaning without fabricating an official channel',()=>{
 for(const source of ['谷歌','特易','特易资讯','Google']){
  const input={...base,source,demand:'门锁需求'};
  const {rows,warnings}=normalizeCustomerImports([input]);
  assert.equal(rows[0].source,'other');assert.ok(rows[0].source_detail.includes(source));
  assert.match(rows[0].source_detail,/待确认/);assert.equal(warnings.length,1);
  assert.equal(input.source,source);
 }
 const {rows}=normalizeCustomerImports([{...base,source:'官网',demand:'门锁需求'}]);
 assert.equal(rows[0].source,'website');
});
test('blank demand is explicitly unconfirmed and surfaced before import, never invented',()=>{
 const input={...base,demand:'  '};
 const {rows,warnings}=normalizeCustomerImports([input]);
 assert.equal(rows[0].demand,'需求待确认');assert.match(rows[0].source_detail,/原文件需求为空/);
 assert.match(warnings.join('\n'),/第2行：需求未填写/);assert.equal(input.demand,'  ');
 const provided=normalizeCustomerImports([{...base,demand:'客户原需求'}]);
 assert.equal(provided.rows[0].demand,'客户原需求');
});
test('short real demand retains its exact words and satisfies the server minimum without invention',()=>{
 const {rows,warnings}=normalizeCustomerImports([{...base,demand:'门锁'}]);
 assert.equal(rows[0].demand,'需求记录：门锁');assert.equal(warnings.length,1);
});
test('daily template is accepted by the customer parser and acquisition date stays distinct from purchase date',async()=>{
 const {readFile}=await import('node:fs/promises');const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('      const customerImportKeys='),end=html.indexOf('      function downloadCustomerImportTemplate',start);
 const parse=new Function(html.slice(start,end)+';return parseCustomerCsv;')();
 const parsed=parse('客户名称,联系人,国家,邮箱,电话,来源,需求简述,获取日期\n示例公司,示例联系人,示例地区,a@example.com,,电话,联系了解需求,2026-10-01');
 const row=normalizeCustomerImports(parsed).rows[0];assert.equal(row.company,'示例公司');assert.equal(row.source,'phone');assert.match(row.source_detail,/原线索获取日期：2026-10-01/);assert.equal(row.expected_purchase_date,undefined);
});
