import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeCustomerCsv,readCustomerCsv} from '../assets/customer-csv-reader.mjs';
const csv='公司名称,联系人,国家/地区,来源渠道,需求摘要\r\n"示例,公司",李明,中国,outbound,"门锁需求\n需核对"';
test('UTF-8 with and without BOM preserves Chinese, quotes and embedded newlines',()=>{
 for(const prefix of ['', '\uFEFF'])assert.equal(decodeCustomerCsv(new TextEncoder().encode(prefix+csv)),csv);
});
test('Windows GBK CSV headers decode without replacement characters',()=>{
 // 公司名称,国家/地区,来源渠道,需求摘要
 const bytes=Uint8Array.from(Buffer.from('b9abcbbec3fbb3c62cb9fabcd22fb5d8c7f82cc0b4d4b4c7feb5c02cd0e8c7f3d5aad2aa','hex'));
 assert.equal(decodeCustomerCsv(bytes),'公司名称,国家/地区,来源渠道,需求摘要');
});
test('UTF-16 BOM exports decode in both byte orders',()=>{
 const le=Buffer.from('\uFEFF'+csv,'utf16le');assert.equal(decodeCustomerCsv(le),csv);
 const be=Buffer.from(le);be.swap16();assert.equal(decodeCustomerCsv(be),csv);
});
test('already lossy or binary input is blocked before import',()=>{
 for(const bytes of [new TextEncoder().encode('公司,�'),Uint8Array.of(0,1,2),Uint8Array.of(0xef,0xbb,0xbf,0xff)])assert.throws(()=>decodeCustomerCsv(bytes),/尚未导入/);
});
test('reader uses binary bytes rather than lossy File.text',async()=>{
 assert.equal(await readCustomerCsv({arrayBuffer:async()=>new TextEncoder().encode(csv).buffer}),csv);
 for(const name of ['index.html','grace.html']){
 const html=await readFile(new URL('../'+name,import.meta.url),'utf8');
 assert.match(html,/parseCustomerCsv\(await readCustomerCsv\(file\)\)/);
 assert.doesNotMatch(html,/parseCustomerCsv\(await file.text\(\)\)/);
 }
});
test('decoded legacy headers pass the actual customer parser and preserve row values',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('      const customerImportKeys=');
 const end=html.indexOf('      function downloadCustomerImportTemplate',start);
 const parse=new Function(html.slice(start,end)+'; return parseCustomerCsv;')();
 const header=decodeCustomerCsv(Uint8Array.from(Buffer.from('b9abcbbec3fbb3c62cb9fabcd22fb5d8c7f82cc0b4d4b4c7feb5c02cd0e8c7f3d5aad2aa','hex')));
 const rows=parse(header+'\r\n"示例,公司",中国,outbound,"门锁需求\n需核对"');
 assert.equal(rows.length,1);assert.equal(rows[0].company,'示例,公司');
 assert.equal(rows[0].demand,'门锁需求\n需核对');assert.equal(rows[0].row_number,2);
 assert.throws(()=>parse('错误表头,国家/地区,来源渠道,需求摘要\n示例,中国,outbound,需求'),/不支持的表头/);
});
