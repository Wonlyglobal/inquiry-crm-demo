import test from 'node:test';
import assert from 'node:assert/strict';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
import {productParameterAnswer} from '../supabase/functions/agent-conversation/product-parameter-answer.mjs';
const asset=(i,quote,field='尺寸',version='V9')=>({name:`Source ${i}`,isCurrentVersion:true,versionLabel:version,document:{status:'ready',sha256:String(i).repeat(64),pages_total:1,pages:[{page:1,chunks:[quote],facts:[{field,quote,value:'invented 999mm'}]}]}});
test('all authorized sources contribute; invented values and adjacent models do not',()=>{
 const data=gateMaterialEvidence({status:'available',assets:[asset(1,'TEST80 PRO Dimensions 400mm'),asset(2,'TEST80 Dimensions 900mm'),asset(3,'TEST80 PRO Door thickness 50mm','门厚'),asset(4,'TEST80 PRO Dimensions 410mm')]});
 const answer=productParameterAnswer(data,'TEST80 PRO尺寸');
 assert.match(answer,/400mm/);assert.match(answer,/410mm/);assert.match(answer,/Source 4/);assert.doesNotMatch(answer,/900mm|999mm|50mm/);assert.match(answer,/来源表述不同/);assert.match(answer,/打开对应画册/);
});
test('explicit version does not match a version prefix or silently merge old versions',()=>{
 const data=gateMaterialEvidence({status:'available',assets:[asset(1,'TEST80 PRO Dimensions 400mm','尺寸','V1'),asset(2,'TEST80 PRO Dimensions 410mm','尺寸','V10')]});
 const answer=productParameterAnswer(data,'TEST80 PRO V1尺寸');assert.match(answer,/400mm/);assert.doesNotMatch(answer,/410mm/);
});
test('document and native evidence produce one targeted answer with explicit conflicts',()=>{
 const data=gateMaterialEvidence({status:'available',assets:[asset(1,'TEST80 PRO Dimensions 400mm')]});
 const fact={model:'TEST80 PRO',field:'尺寸',value:'410mm',ref:'Native PDF 第4页',source_page:4,sha256:'a'.repeat(64),edition:'V9',analysis_eligible:true};
 const answer=productParameterAnswer(data,'TEST80 PRO尺寸',{facts:[fact,{...fact,field:'门厚',value:'50–100mm'},{...fact,model:'TEST80',value:'900mm'}]});
 assert.match(answer,/400mm/);assert.match(answer,/410mm/);assert.match(answer,/来源表述不同/);
 assert.doesNotMatch(answer,/50–100|900mm|暂不能确认/);
 for(const native of [{facts:[{...fact,analysis_eligible:false}]},{facts:[fact],retrieval_incomplete:true}]){
  assert.doesNotMatch(productParameterAnswer(data,'TEST80 PRO尺寸',native),/410mm/);
 }
});

const {normalizeDocument}=await import('../supabase/functions/agent-conversation/document-knowledge.mjs');
function tableData(text,kind='native_text'){
 const rows=text.split('\n').filter(x=>/尺寸/.test(x));
 const document=normalizeDocument({status:'ready',sha256:'a'.repeat(64),pages_total:1,pages:[{page:1,kind,chunks:[text],facts:rows.map(quote=>({field:'尺寸',kind:'source_excerpt',quote}))}]},'TEST80 PRO尺寸');
 return gateMaterialEvidence({status:'available',assets:[{name:'Parameter table',isCurrentVersion:true,versionLabel:'V1',document}]});
}
test('single-model native table associates header with rows and separates front/rear dimensions',()=>{
 const text='产品型号\n 模块 功能和设计\n TEST80 Pro\n 前面板尺寸（不含手柄） 400mm*80mm*50mm\n 后面板尺寸（不含手柄） 410mm*80mm*30mm\n 适用门厚 50－100mm';
 const data=tableData(text),answer=productParameterAnswer(data,'TEST80 Pro尺寸');
 assert.match(answer,/400mm × 80mm × 50mm/);assert.match(answer,/410mm × 80mm × 30mm/);
 assert.doesNotMatch(answer,/来源表述不同|50－100|模块|产品型号/);
 assert.match(answer,/第 1 页/);
});
test('table association refuses multiple models, OCR-only and missing header',()=>{
 const row='前面板尺寸 400mm*80mm*50mm';
 for(const [text,kind] of [['产品型号\n TEST80 Pro TEST90 Pro\n'+row,'native_text'],['产品型号\n TEST80 Pro\n'+row,'ocr'],['TEST80 Pro\n'+row,'native_text'],['产品型号\n TEST80 Pro\n[页面OCR，需核对]\n'+row,'native_and_ocr']]){
  assert.equal(productParameterAnswer(tableData(text,kind),'TEST80 Pro尺寸'),null);
 }
});

test('front or rear panel questions return only the requested component',()=>{
 const data=tableData('产品型号\n TEST80 Pro\n 前面板尺寸（不含手柄） 400mm*80mm*50mm\n 后面板尺寸（不含手柄） 410mm*80mm*30mm');
 const front=productParameterAnswer(data,'TEST80 Pro前面板尺寸');
 assert.match(front,/400mm/);assert.doesNotMatch(front,/410mm/);
 const rear=productParameterAnswer(data,'TEST80 Pro后面板尺寸');
 assert.match(rear,/410mm/);assert.doesNotMatch(rear,/400mm/);
});

test('spreadsheet dimensions require source-bound model and value cells in the same column',()=>{
 const sha='a'.repeat(64);
 const quote='A5=型号 | B5= | C5=TEST80 Pro | D5=TEST90 Pro\nA12=尺寸 | B12= | C12=360 × 80 × 52 mm | D12=490 × 75 × 39 mm';
 const finding={page:1,product:'TEST80 Pro',model:'TEST80 Pro',field:'尺寸',value:'360 × 80 × 52 mm',quote,method:'sheet_columns',modelCell:'C5',valueCell:'C12',fieldCell:'A12'};
 function run(evidence, pageChunks=[quote], sourceHash=sha){
  const question='TEST80 Pro 尺寸';
  const document=normalizeDocument({status:'ready',sha256:sha,pages_total:1,
   pages:[{page:1,kind:'sheet_cells',chunks:pageChunks,facts:[]}],
   product_understanding:{schema:'local-product-v1',source_sha256:sourceHash,status:'partial',findings:[evidence]}},question);
  return productParameterAnswer(gateMaterialEvidence({status:'available',assets:[{name:'Parameter table',isCurrentVersion:true,versionLabel:'V1',document}]}),question);
 }
 const answer=run(finding);
 assert.match(answer,/360 × 80 × 52 mm/);
 assert.match(answer,/单元格 C5 \/ C12/);
 assert.doesNotMatch(answer,/490 × 75 × 39 mm/);
 assert.equal(run({...finding,valueCell:'D12',value:'490 × 75 × 39 mm'}),null);
 assert.equal(run({...finding,fieldCell:'A5'}),null);
 assert.equal(run(finding,quote.split('\n')),null);
 assert.equal(run(finding,[quote],'b'.repeat(64)),null);
});
