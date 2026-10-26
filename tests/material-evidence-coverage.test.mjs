import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFullMaterials} from '../supabase/functions/agent-conversation/materials.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
import {evidenceCheck} from '../supabase/functions/agent-conversation/acceptance-status.mjs';
import {modelMarketEvidence,productMarketReport} from '../supabase/functions/agent-conversation/product-market.mjs';
import {MATERIAL_ACTOR,verifyMaterialRequest} from '../supabase/functions/agent-conversation/material-request-proof.mjs';

// Synthetic signing keys and an injected fetcher only: no credentials, network or production files.
const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const privateJwk=JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey));
const publicJwk=JSON.stringify(await crypto.subtle.exportKey('jwk',keys.publicKey));
const sha='a'.repeat(64),model='TEST80 PRO',quote=model+' synthetic power 8V';
const finding=(o={})=>({product:model,field:'供电',value:'8V',quote,page:1,...o});
const native=(o={})=>({field:'供电',kind:'source_excerpt',quote,...o});
const document=(o={})=>({status:'ready',sha256:sha,pages_total:8,pages_processed:8,pages_with_text:8,pages:[{page:1,chunks:[quote],facts:[]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[finding()]},...o});
const asset=(doc,o={})=>({id:'synthetic',name:'Synthetic V9.pdf',versionLabel:'V9',isCurrentVersion:true,updatedAt:'2026-10-26',document:doc,...o});
async function retrieve(assets,question=model+' 智能锁画册v9 供电'){
 const raw=await loadFullMaterials({actor:MATERIAL_ACTOR,privateJwk,secret:'synthetic',serviceUrl:'https://file.foreverdoodle.com',question},async(url,request)=>{
  assert.equal(url,'https://file.foreverdoodle.com/api/integrations/crm/knowledge');
  assert.ok(await verifyMaterialRequest({proof:request.headers['X-CRM-Proof'],body:request.body,publicJwk}));
  assert.equal(JSON.parse(request.body).constraints.version,'v9');
  return Response.json({status:'available',scope:'authorized_material_library',page:1,assets});
 });
 const gated=gateMaterialEvidence(raw);
 return {gated,product:modelMarketEvidence(model,null,gated,{edition:'V9'})};
}
function budgets(d){
 assert.ok(d.pages.length<=6);assert.ok((d.product_understanding?.findings.length||0)<=12);
 for(const p of d.pages){assert.ok(p.chunks.length<=3);assert.ok(p.facts.length<=4);for(const c of p.chunks)assert.ok(c.length<=850)}
}

test('new native field labels survive the signed load, normalizer, gate and market report',async()=>{
 for(const field of ['开锁方式','供电','电池','功能','配置','适用条件','厚度']){
  const doc=document({product_understanding:null,pages:[{page:1,chunks:[quote],facts:[native({field})]}]});
  const {gated,product}=await retrieve([asset(doc)]);
  assert.equal(product.facts.length,1,field);assert.equal(product.facts[0].field,field);
  const report=productMarketReport({question:model+' 智能锁v9 新加坡市场分析',catalog:null,materials:gated});
  assert.equal(report.current_parameter_count,1);assert.equal(report.product.human_verified,false);budgets(gated.assets[0].document);
 }
});

test('requested quote windows survive the fourth chunk and late characters without joining text',async()=>{
 for(const chunks of [['unrelated a','unrelated b','unrelated c',quote],['x'.repeat(1000)+' '+quote+' '+'y'.repeat(1000)]]){
  const {gated,product}=await retrieve([asset(document({pages:[{page:1,chunks,facts:[]}]}))]);
  assert.equal(product.facts.length,1);const d=gated.assets[0].document;budgets(d);
  assert.ok(d.pages[0].chunks.some(c=>c.includes(quote)));
  for(const c of d.pages[0].chunks)assert.ok(chunks.some(original=>original.includes(c)));
  if(chunks.length===1)assert.equal(gated.evidence_gate.diagnostics.chunks_repositioned,1);
 }
});

test('target findings and their supporting page are selected before the existing limits',async()=>{
 const other=Array.from({length:12},(_,i)=>finding({product:'OTHER90',field:'unrelated '+i,quote:'OTHER90 synthetic power 5V',value:'5V'}));
 const doc=document({pages:Array.from({length:7},(_,i)=>({page:i+1,chunks:[i===6?quote:'OTHER90 synthetic power 5V'],facts:[]})),product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[...other,finding({page:7})]}});
 const {gated,product}=await retrieve([asset(doc)]);
 assert.equal(product.facts.length,1);assert.match(product.facts[0].ref,/第7页/);budgets(gated.assets[0].document);
 assert.equal(gated.evidence_gate.diagnostics.semantic_findings_omitted,1);assert.equal(gated.evidence_gate.diagnostics.pages_omitted,1);
});

test('requested native evidence outranks unrelated facts and semantic chunks within the same page',async()=>{
 const other=Array.from({length:4},(_,i)=>finding({product:'OTHER90',field:'尺寸',quote:'OTHER90 synthetic dimension '+i+'mm',value:i+'mm'}));
 const chunks=[...other.map(f=>f.quote),quote];
 const doc=document({pages:[{page:1,chunks,facts:[...other.map(f=>native({field:'尺寸',quote:f.quote})),native()]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:other}});
 const {gated,product}=await retrieve([asset(doc)]);
 assert.equal(product.facts.length,1);assert.equal(product.facts[0].field,'供电');budgets(gated.assets[0].document);
 assert.equal(gated.evidence_gate.diagnostics.native_facts_omitted,1);
});

test('invalid or unsupported findings cannot consume all slots before a supported target',async()=>{
 for(const bad of [finding({product:'MISSING'}),finding({value:'9V'}),finding({quote:model+' absent source 8V'})]){
  const doc=document({product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[...Array.from({length:12},(_,i)=>({...bad,field:'供电 '+i})),finding()]}});
  const {gated,product}=await retrieve([asset(doc)]);assert.equal(product.facts.length,1);assert.equal(product.facts[0].value,'8V');budgets(gated.assets[0].document);
 }
});

test('same source native quote and interpretation are one item, distinct values still conflict',async()=>{
 const {product}=await retrieve([asset(document({pages:[{page:1,chunks:[quote],facts:[native()]}]}))]);
 assert.equal(product.facts.length,1);assert.equal(product.facts[0].value,'8V');assert.equal(product.duplicate_evidence_count,1);assert.deepEqual(product.conflicts,[]);
 const differing=quote+'; synthetic alternative 9V';
 const conflicting=document({pages:[{page:1,chunks:[differing],facts:[native({quote:differing})]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[finding(),finding({quote:differing,value:'9V'})]}});
 const r=await retrieve([asset(conflicting)]);assert.equal(r.product.facts.length,0);assert.equal(r.product.conflicts.length,1);
 const sameQuote=document({pages:[{page:1,chunks:[differing],facts:[]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[finding({quote:differing}),finding({quote:differing,value:'9V'})]}});
 assert.equal((await retrieve([asset(sameQuote)])).product.conflicts.length,1);
});

test('exact duplicate source evidence cannot exhaust the finding or native fact budgets',async()=>{
 const second=finding({field:'配置',quote:model+' synthetic option',value:'synthetic option'});
 const doc=document({pages:[{page:1,chunks:[quote,second.quote],facts:[...Array.from({length:4},()=>native()),native({field:second.field,quote:second.quote})]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[...Array.from({length:12},()=>finding()),second]}});
 const {gated,product}=await retrieve([asset(doc)]);
 assert.equal(product.facts.length,2);assert.equal(gated.evidence_gate.diagnostics.semantic_finding_duplicates,11);assert.equal(gated.evidence_gate.diagnostics.native_fact_duplicates,3);budgets(gated.assets[0].document);
});

test('new selection never bypasses exact model, edition, current status, hash or page quotes',async()=>{
 const cases=[
  asset(document(),{name:'Synthetic V8.pdf',versionLabel:'V8'}),
  asset(document(),{isCurrentVersion:false}),
  asset(document({sha256:'bad'})),
  asset(document({status:'failed'})),
  asset(document({product_understanding:{schema:'local-product-v1',source_sha256:'b'.repeat(64),status:'processed',findings:[finding()]}})),
  asset(document({pages:[{page:1,chunks:[model,'synthetic power 8V'],facts:[]}]})),
  asset(document({product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[finding({value:'9V'})]}})),
  asset(document({product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[finding({product:'OTHER90'})]}})),
  asset(document({product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[finding({product:'TEST80 MAX',quote:'TEST80 MAX synthetic power 8V'})]},pages:[{page:1,chunks:['TEST80 MAX synthetic power 8V'],facts:[native({quote:'TEST80 MAX synthetic power 8V'})]}]}))
 ];
 for(const a of cases)assert.equal((await retrieve([a])).product.facts.length,0);
});

test('long chunk windows do not evict a different chunk containing a contradictory value',async()=>{
 const rows=[finding(),finding({field:'尺寸',value:'20mm',quote:model+' synthetic size 20mm'}),finding({field:'材质',value:'steel',quote:model+' synthetic steel'}),finding({value:'9V',quote:model+' synthetic power 9V'})];
 const long=rows.slice(0,3).map(f=>f.quote).join(' '+' '+'x'.repeat(1000)+' '+' ');
 const doc=document({pages:[{page:1,chunks:[long,rows[3].quote],facts:[]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:rows}});
 const {gated,product}=await retrieve([asset(doc)],model+' 智能锁画册v9 参数');
 assert.ok(product.conflicts.includes('供电'));assert.ok(!product.facts.some(f=>f.field==='供电'));budgets(gated.assets[0].document);
});

test('omitted same-field candidates at every display limit forbid a remaining-field conclusion',async()=>{
 const second=finding({value:'9V',quote:model+' synthetic power 9V'});
 const filler=Array.from({length:11},(_,i)=>finding({field:'尺寸 '+i,value:'20mm',quote:model+' synthetic size 20mm '+i}));
 const scenarios=[
  document({pages:[{page:1,chunks:[quote+' '+'x'.repeat(1000)+' '+filler[0].quote+' '+'x'.repeat(1000)+' '+filler[1].quote+' '+'x'.repeat(1000)+' '+second.quote],facts:[]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[finding(),...filler.slice(0,2),second]}}),
  document({pages:[{page:1,chunks:[[quote,...filler.map(f=>f.quote),second.quote].join('\n')],facts:[]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[finding(),...filler,second]}}),
  document({pages:Array.from({length:7},(_,i)=>({page:i+1,chunks:[i===6?second.quote:quote],facts:[]})),product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:Array.from({length:7},(_,i)=>finding(i===6?{...second,page:7}:{page:i+1}))}}),
  document({product_understanding:null,pages:[{page:1,chunks:Array.from({length:5},(_,i)=>model+' synthetic power '+(i+8)+'V'),facts:Array.from({length:5},(_,i)=>native({quote:model+' synthetic power '+(i+8)+'V'}))}]})
 ];
 for(const doc of scenarios){
  const {gated,product}=await retrieve([asset(doc)],model+' 智能锁画册v9 参数');
  assert.ok(product.incomplete_fields.includes('供电'));assert.ok(!product.facts.some(f=>f.field==='供电'));
  assert.ok(gated.evidence_gate.diagnostics.budget_incomplete_fields>0);budgets(gated.assets[0].document);
 }
});

test('out-of-range pages cannot consume the page budget and ranking uses the market model key',async()=>{
 const invalid=Array.from({length:6},(_,i)=>({page:i+2,chunks:[quote],facts:[native()]}));
 const {gated,product}=await retrieve([asset(document({pages_total:1,pages:[...invalid,{page:1,chunks:[quote],facts:[native()]}],product_understanding:null}))]);
 assert.equal(product.facts.length,1);assert.equal(gated.evidence_gate.diagnostics.pages_out_of_range,6);assert.equal(gated.assets[0].document.pages[0].page,1);
 const other=Array.from({length:12},(_,i)=>finding({product:'OTHER90',field:'供电 '+i,value:'5V',quote:'OTHER90 power 5V'}));
 const doc=document({pages:[{page:1,chunks:['OTHER90 power 5V',quote],facts:[]}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[...other,finding()]}});
 const r=await retrieve([asset(doc)],'TEST80-PRO 智能锁画册v9 供电');assert.equal(r.product.facts.length,1);assert.equal(r.product.facts[0].value,'8V');
});

test('diagnostics distinguish missing pages and unsupported numbers without exposing text',async()=>{
 const doc=document({product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[finding({page:8}),finding({value:'9V'})]}});
 const {gated}=await retrieve([asset(doc)]),check=evidenceCheck(gated);
 assert.equal(check.diagnostics.semantic_page_missing,1);assert.equal(check.diagnostics.semantic_number_missing,1);
 assert.equal(check.rejected,1);assert.ok(Object.values(check.diagnostics).every(Number.isSafeInteger));
 for(const text of [model,quote,'Synthetic','8V','9V'])assert.ok(!JSON.stringify(check).includes(text));
 const badPages=document({pages_total:1,pages:[{page:-1,chunks:[]},{page:2,chunks:[quote]}]});
 const bad=await retrieve([asset(badPages)]);assert.equal(bad.gated.evidence_gate.diagnostics.pages_invalid,1);assert.equal(bad.gated.evidence_gate.diagnostics.pages_out_of_range,1);
 const injected=evidenceCheck({status:'available',assets:[],evidence_gate:{diagnostics:{secret:'PRIVATE',pages_omitted:'PRIVATE',native_quote_missing:Infinity}}});
 assert.ok(!JSON.stringify(injected).includes('PRIVATE'));assert.ok(Object.values(injected.diagnostics).every(Number.isSafeInteger));
});
