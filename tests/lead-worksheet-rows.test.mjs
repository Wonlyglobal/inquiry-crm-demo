import test from 'node:test';import assert from 'node:assert/strict';
import {compactLeadWorksheet,leadWorksheetRecords} from '../assets/lead-worksheet-rows.mjs';
test('format-only used rows do not inflate actual records or truncate later values',()=>{
 const sheet={'!ref':'A1:H1048576','!fullref':'A1:H1048576',A1:{v:'客户名称'},A2:{v:'示例'},H900:{v:''},A1048576:{s:{fill:1}},A500:{v:'第二条'}};
 const result=compactLeadWorksheet(sheet);assert.deepEqual(result.sourceRows,[1,2,500]);assert.equal(result.sheet['!ref'],'A1:A3');assert.equal(result.sheet.A3.v,'第二条');assert.equal(sheet.A500.v,'第二条');
});
test('200 actual data rows allowed, 201 rejected even when original rows are sparse',()=>{
 const sheet={A1:{v:'客户名称'}};for(let i=1;i<=200;i++)sheet['A'+(i*100)]={v:'示例'};
 assert.equal(compactLeadWorksheet(sheet).sourceRows.length,201);
 sheet.A999999={v:'多一条'};assert.throws(()=>compactLeadWorksheet(sheet),/200条实际数据/);
});
test('zero/false stay real content; whitespace-only cells do not count',()=>{
 const {sheet,sourceRows}=compactLeadWorksheet({A1:{v:'名称'},A2:{v:0},A3:{v:false},A4:{v:'  '},A5:{v:null}});
 assert.deepEqual(sourceRows,[1,2,3]);assert.equal(sheet.A2.v,0);assert.equal(sheet.A3.v,false);
});
test('original physical row numbers survive compact conversion for validation errors',()=>{
 const X={utils:{sheet_to_json:()=>[{name:'one'},{name:'two'}]}};
 const records=leadWorksheetRecords(X,{A1:{v:'名称'},A5:{v:'one'},A700:{v:'two'}});
 assert.equal(records[0].__rowNum__,4);assert.equal(records[1].__rowNum__,699);
});
