import test from 'node:test';
import assert from 'node:assert/strict';
import {modelCodes,bareModel,normalizeProductInput} from '../supabase/functions/agent-conversation/product-input.mjs';
import {mentions} from '../supabase/functions/agent-conversation/product-materials.mjs';
import {findModels} from '../supabase/functions/agent-conversation/catalog-knowledge.mjs';
import {productEvidence} from '../supabase/functions/agent-conversation/product-evidence.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
import {modelMarketEvidence} from '../supabase/functions/agent-conversation/product-market.mjs';
const sha='a'.repeat(64);
const finding=(quote,model='QX80')=>({product:model,model,field:'开锁方式',value:'synthetic fingerprint',page:1,quote});
const asset=f=>({id:'synthetic',name:'Synthetic V9',versionLabel:'V9',isCurrentVersion:true,document:{status:'partial',pages_total:1,sha256:sha,pages:[{page:1,chunks:[f.quote],facts:[]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'partial',findings:[f]}}});

test('explicit Basic, Standard and Lite suffixes remain part of the complete model across input methods',()=>{
 for(const suffix of ['Basic','Standard','Lite'])for(const q of [`QX80 ${suffix}`,`QX80${suffix}`,`QX-80_${suffix}`,`QX80/${suffix}`,`QX80.${suffix}`,`QX80 / ${suffix}`,`QX80 . ${suffix}`,`QX80\n${suffix}`]){
  assert.deepEqual(modelCodes(q),['QX80 '+suffix.toUpperCase()]);
  assert.equal(bareModel(q),true);
 }
 assert.equal(normalizeProductInput('QX八零Basic'),'QX80 Basic');
});

test('a base model never matches a sibling configuration even when a catalogue contains only the base',()=>{
 const catalog={products:[{model:'QX80'}]};
 for(const suffix of ['Pro','Max','Plus','Ultra','Lite','Basic','Standard']){
  assert.equal(mentions({excerpt:`QX80 ${suffix} synthetic fingerprint`},'QX80'),false);
  assert.deepEqual(findModels(`QX80 ${suffix} 参数`,catalog),[]);
 }
 assert.deepEqual(findModels('QX80参数',catalog),['QX80']);
 assert.deepEqual(findModels('QX80 Basic参数',{products:[{model:'QX80'},{model:'QX80 Basic'}]}),['QX80 Basic']);
});

test('machine model aliases cannot relabel a variant quote as the base model',()=>{
 const f=finding('QX80 MAX synthetic fingerprint');
 const a=asset(f),raw=a.document.product_understanding;
 assert.equal(productEvidence(raw,sha).findings.length,0);
 const gated=gateMaterialEvidence({status:'available',assets:[a]});
 assert.equal(gated.assets[0].document.product_understanding.findings.length,0);
 assert.equal(gated.evidence_gate.diagnostics.semantic_product_missing,1);
 assert.equal(modelMarketEvidence('QX80',null,{status:'available',assets:[a]}).facts.length,0);
});

test('a complete matching configuration retains its literal source, while another suffix is rejected',()=>{
 const f=finding('QX80 Basic synthetic fingerprint','QX80 Basic'),a=asset(f);
 assert.equal(productEvidence(a.document.product_understanding,sha).findings.length,1);
 assert.equal(gateMaterialEvidence({status:'available',assets:[a]}).assets[0].document.product_understanding.findings.length,1);
 assert.equal(modelMarketEvidence('QX80 Basic',null,{status:'available',assets:[a]}).facts.length,1);
 assert.equal(modelMarketEvidence('QX80 Standard',null,{status:'available',assets:[a]}).facts.length,0);
});

test('an explicit product code cannot be changed by a semantic model alias in a comparison quote',()=>{
 const f={...finding('QX80 MAX has synthetic fingerprint. QX80 is a separate base model.'),product:'QX80 MAX',model:'QX80'};
 const a=asset(f);
 assert.equal(productEvidence(a.document.product_understanding,sha).findings.length,0);
 assert.equal(gateMaterialEvidence({status:'available',assets:[a]}).assets[0].document.product_understanding.findings.length,0);
 assert.equal(modelMarketEvidence('QX80',null,{status:'available',assets:[a]}).facts.length,0);
});

test('a clipped base-model quote inside a full variant name cannot acquire a false source association',()=>{
 const f={...finding('QX80'),field:'型号',value:'QX80'};
 const a=asset(f);a.document.pages[0].chunks=['QX80 Basic has synthetic fingerprint'];
 const result=gateMaterialEvidence({status:'available',assets:[a]});
 assert.equal(result.assets[0].document.product_understanding.findings.length,0);
 assert.equal(result.evidence_gate.diagnostics.semantic_product_missing,1);
 assert.equal(modelMarketEvidence('QX80',null,{status:'available',assets:[a]}).facts.length,0);
 a.document.product_understanding=null;a.document.pages[0].facts=[{field:'型号',quote:'QX80'}];
 assert.equal(modelMarketEvidence('QX80',null,{status:'available',assets:[a]}).facts.length,0);
});

test('non-model two-character product names retain literal source evidence',async()=>{
 const {normalizeDocument}=await import('../supabase/functions/agent-conversation/document-knowledge.mjs');
 for(const product of ['木门','钢门']){
  const f={product,field:'厚度',value:'20mm',page:1,quote:product+' synthetic 20mm'};
  const a=asset(f);a.document=normalizeDocument(a.document,'物料：'+product+'厚度');
  assert.equal(gateMaterialEvidence({status:'available',assets:[a]}).assets[0].document.product_understanding.findings.length,1);
 }
});

test('cropping cannot turn a variant occurrence into base-model evidence',async()=>{
 const {normalizeDocument}=await import('../supabase/functions/agent-conversation/document-knowledge.mjs');
 const q1='QX80 has synthetic keypad',q2='synthetic retina model QX80';
 const chunk=q1+' '+'.'.repeat(850-q1.length-1-q2.length)+q2+' Basic has synthetic retina variant';
 const a=asset({...finding(q1),value:'keypad'});
 a.document.pages[0].chunks=[chunk];
 a.document.product_understanding.findings.push({...finding(q2),field:'功能',value:'retina'});
 a.document=normalizeDocument(a.document,'QX80 参数');
 const r=gateMaterialEvidence({status:'available',assets:[a]});
 assert.equal(r.assets[0].document.product_understanding.findings.length,1);
 assert.ok(r.evidence_gate.diagnostics.semantic_findings_invalid>0);
 assert.ok(!modelMarketEvidence('QX80',null,r).facts.some(f=>f.value==='retina'));
});

test('quote windows locate a valid repeated occurrence rather than an earlier variant',async()=>{
 const {normalizeDocument}=await import('../supabase/functions/agent-conversation/document-knowledge.mjs');
 const f={...finding('QX80'),field:'型号',value:'QX80'},a=asset(f);
 a.document.pages[0].chunks=['QX80 Basic synthetic. '+'.'.repeat(1200)+' QX80 is a separate base model.'];
 a.document=normalizeDocument(a.document,'QX80 型号');
 const r=gateMaterialEvidence({status:'available',assets:[a]});
 assert.equal(r.assets[0].document.product_understanding.findings.length,1);
 assert.equal(modelMarketEvidence('QX80',null,r).facts.length,1);
});
