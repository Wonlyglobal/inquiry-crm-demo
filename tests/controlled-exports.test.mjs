import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('all application bulk export buttons enter the governed workflow',()=>{
 for(const id of ['dashboard-export-csv','dashboard-export-pdf','ai-export-csv','ai-export-pdf'])
  assert.ok(html.includes(`$("#${id}").addEventListener("click",openControlledExportCenter)`));
 assert.doesNotMatch(html,/function exportAiCsv|function printAiResult/);
});
test('export renderer only saves server-generated content and fails closed',()=>{
 const source=html.slice(html.indexOf('      async function callControlledExportRpc'),html.indexOf('      function addAiMessage('));
 assert.match(source,/consume_crm_export/);assert.match(source,/file\.content/);
 assert.doesNotMatch(source,/XLSX|aiReportModel\(|innerText|JSON\.stringify\(dashboard/);
 assert.match(source,/不会改用浏览器直接导出/);
});

test('notification links enter authorized export views and quotation viewing does not print',()=>{
 assert.match(html,/item\.export_request_id/);
 assert.match(html,/查看导出审批/);
 assert.doesNotMatch(html,/data-quote-print|window\.print\(\)/);
 assert.match(html,/data-quote-view/);
});
