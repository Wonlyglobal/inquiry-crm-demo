import test from 'node:test';import assert from 'node:assert/strict';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
import {productLedger,productLedgerText} from '../supabase/functions/agent-conversation/product-coverage.mjs';
import {fullMaterialAnswer} from '../supabase/functions/agent-conversation/materials.mjs';
import {conciseMaterialAnswer} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
import {normalizeDocument} from '../supabase/functions/agent-conversation/document-knowledge.mjs';

const sha='a'.repeat(64);
const finding=(o={})=>({product:'TEST-X1',field:'厚度',value:'1.2mm',page:1,quote:'TEST-X1 门板厚度 1.2mm',...o});
const doc=(findings,o={})=>normalizeDocument({status:'ready',sha256:sha,pages_total:3,pages_processed:3,pages_with_text:3,pages:[{page:1,kind:'native_text',chunks:['TEST-X1 门板厚度 1.2mm，TEST-X1 耐火 60 分钟。']}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings},...o});
const data=assets=>({status:'available',page:1,assets});
const asset=(id,d)=>({id,name:'资料'+id,versionLabel:'v1',isCurrentVersion:true,updatedAt:'2026-09-01',relativePath:'x/'+id+'.pdf',excerpt:'',document:d,video:null});

test('findings quoted on a returned page survive and stay unverified',()=>{
 const r=gateMaterialEvidence(data([asset('a',doc([finding()]))]));
 const u=r.assets[0].document.product_understanding;
 assert.equal(u.findings.length,1);assert.equal(u.findings[0].human_verified,false);assert.equal(u.hidden_findings,0);
});
test('invented numbers and quotes absent from page text are rejected',()=>{
 const r=gateMaterialEvidence(data([asset('a',doc([finding({value:'1.5mm'}),finding({quote:'TEST-X1 门板厚度 2mm',value:'2mm'})]))]));
 assert.equal(r.assets[0].document.product_understanding.findings.length,0);
 assert.equal(r.evidence_gate.rejected,2);
});
test('findings on pages not returned are hidden, not shown or counted as wrong',()=>{
 const r=gateMaterialEvidence(data([asset('a',doc([finding({page:3})]))]));
 const u=r.assets[0].document.product_understanding;
 assert.equal(u.findings.length,0);assert.equal(u.hidden_findings,1);assert.equal(r.evidence_gate.rejected,0);
 assert.match(productLedgerText({products:[{name:'X',states:{coverage:'',extraction:'',model_check:'',competitor:'',analysis:'',pending:''},conflicts:[]}],similar:[],hidden_findings:1}),/已隐藏/);
});
test('failed documents lose semantic findings entirely',()=>{
 const d=doc([finding()]);d.status='failed';
 assert.equal(gateMaterialEvidence(data([asset('a',d)])).assets[0].document.product_understanding,null);
});
test('ledger shows six states and never claims competitor work or verification',()=>{
 const l=productLedger(gateMaterialEvidence(data([asset('a',doc([finding(),finding({field:'耐火',value:'60 分钟',quote:'TEST-X1 耐火 60 分钟'})]))])));
 assert.equal(l.products.length,1);assert.equal(l.human_verified,false);
 const t=productLedgerText(l);
 for(const s of ['资料覆盖','事实提取','型号核对','竞品证据：未开始','分析：未开始','待人工确认'])assert.ok(t.includes(s),s);
 assert.ok(!/已核验(?!）)|已确认/.test(t.replace('未人工核验','')));
});
test('differing values across files are listed, not resolved',()=>{
 const other=normalizeDocument({status:'ready',sha256:'b'.repeat(64),pages_total:1,pages_processed:1,pages_with_text:1,pages:[{page:1,kind:'native_text',chunks:['TEST-X1 门板厚度 1.5mm']}],product_understanding:{schema:'local-product-v1',source_sha256:'b'.repeat(64),status:'processed',findings:[finding({value:'1.5mm',quote:'TEST-X1 门板厚度 1.5mm'})]}});
 const l=productLedger(gateMaterialEvidence(data([asset('a',doc([finding()])),asset('b',other)])));
 assert.equal(l.products[0].conflicts.length,1);assert.equal(l.products[0].asset_count,2);
 const t=productLedgerText(l);assert.match(t,/尚未判定矛盾/);assert.ok(t.includes('1.2mm')&&t.includes('1.5mm'));
});
test('similar product names are flagged but never merged',()=>{
 const d=normalizeDocument({status:'ready',sha256:sha,pages_total:1,pages_processed:1,pages_with_text:1,pages:[{page:1,kind:'native_text',chunks:['WL-100 厚度 1mm；WL100 厚度 2mm']}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[{product:'WL-100',field:'厚度',value:'1mm',page:1,quote:'WL-100 厚度 1mm'},{product:'WL100',field:'厚度',value:'2mm',page:1,quote:'WL100 厚度 2mm'}]}});
 const l=productLedger(gateMaterialEvidence(data([asset('a',d)])));
 assert.equal(l.products.length,2);assert.equal(l.similar.length,1);assert.equal(l.products[0].conflicts.length,0);
});
test('renderers include the ledger only when gated findings exist',()=>{
 const withF=gateMaterialEvidence(data([asset('a',doc([finding()]))]));
 assert.match(fullMaterialAnswer(withF),/产品理解状态/);assert.match(conciseMaterialAnswer(withF,'TEST-X1 厚度'),/产品理解状态/);
 const none=gateMaterialEvidence(data([asset('a',doc([finding({page:3})]))]));
 const c=conciseMaterialAnswer(none,'TEST-X1 厚度');assert.ok(!c.includes('产品理解状态'));assert.match(c,/已隐藏/);
 assert.ok(!fullMaterialAnswer(none).includes('内部语义提取已处理'));
});
import {coverageSummary} from '../supabase/functions/agent-conversation/document-knowledge.mjs';
test('coverage reports product-first extraction progress and deferred documents honestly',()=>{
 const t=coverageSummary({total:10,ready:8,semantic_processed:2,semantic_processing:1,semantic_partial:0,semantic_waiting:3,semantic_deferred:2});
 assert.match(t,/完成 2，进行中 1，有缺口 0，产品资料排队 3，暂缓 2/);assert.match(t,/不代表与产品无关/);
 assert.ok(!coverageSummary({total:1,ready:1}).includes('产品信息提取'));
});
