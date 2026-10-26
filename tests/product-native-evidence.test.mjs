import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNativeSourceRegion,nativeProductEvidence} from '../supabase/functions/agent-conversation/product-native-evidence.mjs';
import {productDocument,region,span} from './private-product-evidence-fixture.mjs';

// Synthetic text/coordinates only. Never open private source PDFs or import bundles.
const model='TEST80 PRO',sha='a'.repeat(64);
const signed=(extra={})=>({sha256:sha,edition:'V9',is_current_version:true,pages:[1],signed_source:true,...extra});
const run=(doc=productDocument(),options={})=>nativeProductEvidence(doc,{model,sources:[signed()],...options});
const check=(r=region(),options={})=>validateNativeSourceRegion(r,{model,source_sha256:sha,...options});
const clone=structuredClone;
const blocked=(value,reason)=>assert.ok(value.blocked.some(b=>(typeof b==='string'?b:b.reason)===reason),JSON.stringify(value.blocked));
const samePanel=(field,page=1)=>region({page,quote:field,text:model+'\nSynthetic supply 8V\nSynthetic entry keypad\nSynthetic size 40mm\nSynthetic maintenance yearly'});
const sizedText=(length)=>model+'\n'+'x'.repeat(length-[...model].length-2-[...'Synthetic supply 8V'].length)+'\nSynthetic supply 8V';

test('a model heading and punctuation cannot masquerade as a functional field',()=>{
 for(const suffix of ['\n','\n : ;','\nV9']){
  const r=region({text:model+suffix+'\nSynthetic supply 8V'});r.field=span(r.native_text,model+suffix,{name:'功能'});
  blocked(check(r),'field_identity_only');
 }
});

test('native field quotes need no model prefix and retain their exact evidence and geometry',()=>{
 const input=region(),before=clone(input),v=check(input);
 assert.equal(v.blocked.length,0);assert.equal(v.fact.value,input.field.quote);assert.equal(v.fact.source_quote,input.field.quote);
 assert.equal(v.fact.source_quote.includes(model),false);assert.equal(v.fact.source_kind,'native_region');
 assert.deepEqual(v.fact.native_region,input);assert.equal(v.fact.human_verified,false);assert.equal(v.fact.analysis_eligible,false);
 assert.deepEqual(input,before);
});

test('eligibility requires the separate signed current source with the same SHA, edition and returned physical page',()=>{
 const v=run();assert.equal(v.facts.length,1);assert.equal(v.facts[0].analysis_eligible,true);assert.equal(v.facts[0].current,true);
 assert.equal(v.facts[0].source_match,true);assert.equal(v.facts[0].sha256,sha);assert.equal(v.facts[0].source_page,1);
 assert.equal(v.scope,'native_only');assert.equal(v.human_verified,false);assert.equal(v.source_freshness_verified,false);
 for(const source of [signed({sha256:'b'.repeat(64)}),signed({edition:'V8'}),signed({pages:[2]}),signed({signed_source:false})]){
  const r=run(undefined,{sources:[source]});assert.equal(r.facts.length,1);assert.equal(r.facts[0].analysis_eligible,false);assert.equal(r.facts[0].source_match,false);
 }
});

test('missing source context remains readable and never trusts source claims embedded in the private document',()=>{
 const d=productDocument();d.product_evidence.sources=[signed()];
 const v=run(d,{sources:[]});assert.equal(v.facts.length,1);assert.equal(v.facts[0].analysis_eligible,false);assert.equal(v.facts[0].current,false);
 assert.ok(v.gaps.includes('signed_source_page_unmatched'));
});

test('history or an unspecified current-version flag is never promoted to current evidence',()=>{
 for(const flag of [false,undefined,'true',1]){
  const v=run(undefined,{sources:[signed({is_current_version:flag})]});assert.equal(v.facts[0].source_match,true);assert.equal(v.facts[0].current,false);assert.equal(v.facts[0].analysis_eligible,false);
 }
});

test('explicit edition requests isolate unknown and other editions',()=>{
 const d=productDocument();
 blocked(run(d,{edition:'V8'}),'edition_scope_mismatch');
 d.product_evidence.source_edition=null;
 const unknown=run(d);assert.equal(unknown.facts.length,1);assert.equal(unknown.facts[0].edition,null);assert.equal(unknown.facts[0].analysis_eligible,false);
 assert.ok(unknown.gaps.includes('source_edition_unknown'));blocked(run(d,{edition:'V9'}),'edition_scope_mismatch');
 const known=run(productDocument(),{edition:'第九版',sources:[signed({edition:'第九版'})]});assert.equal(known.facts[0].analysis_eligible,true);
 const qualified=productDocument();qualified.product_evidence.source_edition='V9 draft';
 assert.equal(run(qualified).facts[0].analysis_eligible,false);blocked(run(qualified,{edition:'V9'}),'edition_scope_mismatch');
});

test('the original PDF SHA is not the private knowledge digest or lookup key',()=>{
 const d=productDocument();d.knowledge_digest='b'.repeat(64);d.key='product-'+'b'.repeat(64);
 const v=run(d,{sources:[signed({sha256:d.knowledge_digest})]});assert.equal(v.facts[0].sha256,sha);assert.equal(v.facts[0].analysis_eligible,false);
 d.source_sha256='b'.repeat(64);blocked(run(d),'document_source_mismatch');
});

test('unknown dates remain null and extraction time never becomes publication or material-update time',()=>{
 const v=run();assert.equal(v.facts[0].date,null);assert.equal(v.facts[0].published_at,null);assert.equal(v.facts[0].extracted_at,'2026-10-26T00:00:00Z');
 assert.equal(v.facts[0].analysis_eligible,true); // Current is only the matched source's explicit metadata.
 const d=productDocument();d.product_evidence.source_published_at='2026-02-30';d.product_evidence.source_updated_at='yesterday';
 const bad=run(d);assert.equal(bad.facts[0].date,null);assert.equal(bad.facts[0].published_at,null);
 d.product_evidence.source_published_at='2026-09-01';d.product_evidence.source_updated_at='2026-10-25T12:00:00+08:00';
 const known=run(d);assert.equal(known.facts[0].date,'2026-10-25T12:00:00+08:00');assert.equal(known.facts[0].published_at,'2026-09-01');
});

test('Unicode code-point offsets agree with Python/SQL and reject UTF-16 offsets',()=>{
 const r=region({text:'🙂\n'+model+'\nSynthetic supply 8V'}),valid=check(r);assert.equal(valid.fact.source_quote,'Synthetic supply 8V');
 const utf16=clone(r);utf16.field.start=r.native_text.indexOf(r.field.quote);utf16.field.end=utf16.field.start+r.field.quote.length;
 blocked(check(utf16),'field_quote_invalid');
 const wrong=clone(r);wrong.offset_unit='utf16';blocked(check(wrong),'offset_unit_invalid');
});

test('original contextual quotes and multiline complete headings remain intact without adding a model',()=>{
 const contextual=region({text:model+'\nSynthetic supply 8V',quote:model+'\nSynthetic supply 8V'});
 assert.equal(check(contextual).fact.source_quote,contextual.field.quote);
 const multiline=region({model:'TEST80\nPRO',text:'TEST80\nPRO\nSynthetic supply 8V'});
 assert.equal(check(multiline).fact.model,model);assert.equal(check(multiline).fact.native_region.headings[0].quote,'TEST80\nPRO');
});

test('quote offsets are exact and do not accept rewritten, concatenated or shortened evidence',()=>{
 for(const mutate of [r=>r.field.quote='TEST80 PRO '+r.field.quote,r=>r.field.start++,r=>r.field.end--,r=>r.field.start=-1,r=>r.field.end=Infinity,r=>r.field.end=2.5]){
  const r=region();mutate(r);blocked(check(r),'field_quote_invalid');
 }
 const r=region({quote:'q'.repeat(501),text:model+'\n'+'q'.repeat(501)});blocked(check(r),'field_quote_invalid');
 const edge=region({quote:'q'.repeat(500),text:model+'\n'+'q'.repeat(500)});assert.ok(check(edge).fact);
});

test('native evidence refuses OCR, visual and unrotated-coordinate ambiguities',()=>{
 for(const kind of ['ocr','image','visual_inference',undefined]){const r=region();r.source_kind=kind;blocked(check(r),'source_kind_unsupported')}
 for(const rotation of [90,180,270,'0',null]){const r=region();r.rotation=rotation;blocked(check(r),'page_geometry_invalid')}
 const r=region();r.coordinate_system='pdf_bottom_left';blocked(check(r),'page_geometry_invalid');
});

test('page, panel and nested float boxes must be finite and contained',()=>{
 const ok=region();ok.panel_bbox=[0.25,0.5,500.25,300.5];ok.headings[0].bbox=[10.5,10.75,200.5,30.25];ok.field.bbox=[10.5,40.25,200.5,60.75];assert.ok(check(ok).fact);
 for(const box of [[0,0,Infinity,300],[0,0,NaN,300],[0,0,0,300],[-1,0,500,300],[0,0,601,300],[0,0,'500',300]]){const r=region();r.panel_bbox=box;blocked(check(r),'panel_bbox_invalid')}
 const field=region();field.field.bbox=[490,10,510,30];blocked(check(field),'field_bbox_invalid');
 const header=region();header.headings[0].bbox=[-1,10,200,30];blocked(check(header),'heading_anchor_invalid');
 for(const page of [0,-1,1.5,Infinity,'1']){const r=region();r.page=page;blocked(check(r),'page_invalid')}
});

test('two columns cannot share ownership merely because both are inside a whole-page rectangle',()=>{
 const r=region();r.panel_bbox=[0,0,600,800];r.headings[0].bbox=[10,10,180,30];r.field.bbox=[350,50,550,80];
 blocked(check(r),'cross_column_binding');
 const outside=region();outside.field.bbox=[510,40,590,60];blocked(check(outside),'field_bbox_invalid');
});

test('a clipped base or suffix cannot borrow parameters from a longer complete model',()=>{
 for(const [requested,full] of [['TEST80','TEST80 PRO'],['TEST80 PRO','TEST80 PRO BASIC'],['TEST80 PRO','TEST80 PRO STANDARD'],['TEST80 PRO','TEST80 PRO SPECIAL']]){
  const r=region({model:requested,text:full+'\nSynthetic supply 8V'});
  blocked(check(r,{model:requested}),'heading_boundary_invalid');
 }
 const wrong=region();wrong.headings[0].model='TEST80 MAX';blocked(check(wrong),'heading_model_mismatch');
 const alternate=region({model:'TEST80/ Pro'});assert.ok(check(alternate).fact);
});

test('all supplied panel headings must agree and only one physical anchor may own the field',()=>{
 const r=region({text:model+'\nTEST80 MAX\nSynthetic supply 8V'});r.headings.push(span(r.native_text,'TEST80 MAX',{model:'TEST80 MAX'}));
 blocked(check(r),'heading_model_mismatch');
 const duplicate=region();duplicate.headings.push(clone(duplicate.headings[0]));assert.ok(check(duplicate).fact);
 const repeated=region({text:model+'\n'+model+'\nSynthetic supply 8V'});const second=clone(repeated.headings[0]);second.start=[...model].length+1;second.end=second.start+[...model].length;repeated.headings.push(second);
 blocked(check(repeated),'heading_ambiguous');
 const tooMany=region();tooMany.headings=Array.from({length:4},()=>clone(tooMany.headings[0]));blocked(check(tooMany),'heading_count_invalid');
});

test('an omitted second model heading cannot be smuggled through the field quote',()=>{
 const hidden=region({text:model+'\nTEST80 MAX\nSynthetic supply 8V'});blocked(check(hidden),'non_target_model_reference');
 const wrapped=region({text:model+'\nTEST80 MAX\nSynthetic supply 8V',quote:'TEST80 MAX\nSynthetic supply 8V'});blocked(check(wrapped),'non_target_model_reference');
});

test('foreign references with unknown suffix letters are rejected anywhere in the panel or field',()=>{
 for(const other of ['ZX9000 X','ZX9000X','ZX9000/ X','ZX9000- SPECIAL','ＺＸ９０００ X']){
  const body='Synthetic property for '+other;
  blocked(check(region({text:model+'\n'+body,quote:body})),'non_target_model_reference');
  blocked(check(region({text:model+'\n'+other+'\nSynthetic supply 8V'})),'non_target_model_reference');
 }
 for(const suffix of ['X','SPECIAL','/ X','Basic']){
  const body=model+' '+suffix+' synthetic property';
  blocked(check(region({text:model+'\n'+body,quote:body})),'ambiguous_model_reference');
 }
 const repeated=region({text:model+'\n'+model+'\nSynthetic supply 8V'});blocked(check(repeated),'unlisted_model_heading');
});

test('an unbound heading, a heading outside the panel and a field before its heading are blocked',()=>{
 const missing=region();missing.headings=[];blocked(check(missing),'heading_count_invalid');
 const changed=region();changed.headings[0].quote='TEST80 MAX';blocked(check(changed),'heading_anchor_invalid');
 const before=region({text:'Synthetic supply 8V\n'+model});blocked(check(before),'field_precedes_heading');
});

test('one panel native text is counted once across four field records on the same page',()=>{
 const d=productDocument();d.product_evidence.regions=['Synthetic supply 8V','Synthetic entry keypad','Synthetic size 40mm','Synthetic maintenance yearly'].map(quote=>samePanel(quote));
 const v=run(d);assert.equal(v.blocked.length,0);assert.equal(v.facts.length,4);assert.ok(v.facts.every(f=>f.analysis_eligible));
});

test('native text is capped at 2550 code points, with inclusive page-budget edges',()=>{
 const edge=region({text:sizedText(2550)});assert.equal([...edge.native_text].length,2550);assert.ok(check(edge).fact);
 blocked(check(region({text:sizedText(2551)})),'native_text_invalid');
 const d=productDocument(),left=region({text:sizedText(1300)}),right=region({text:sizedText(1300),id:'right'});
 left.panel_bbox=[0,0,300,300];right.panel_bbox=[300,0,600,300];right.headings[0].bbox=[310,10,500,30];right.field.bbox=[310,40,500,60];
 d.product_evidence.regions=[left,right];blocked(run(d),'page_text_budget_exceeded');
});

test('four fields per page, twelve regions and six physical pages are hard limits',()=>{
 const fields=productDocument();fields.product_evidence.regions=Array.from({length:5},()=>region());blocked(run(fields),'field_budget_exceeded');assert.equal(run(fields).facts.length,0);
 const regions=productDocument();regions.product_evidence.regions=Array.from({length:13},(_,i)=>region({page:Math.floor(i/3)+1}));blocked(run(regions),'region_budget_exceeded');
 const pages=productDocument();pages.product_evidence.regions=Array.from({length:7},(_,i)=>region({page:i+1}));blocked(run(pages),'page_budget_exceeded');
 const edge=productDocument();edge.product_evidence.regions=Array.from({length:12},(_,i)=>region({page:Math.floor(i/2)+1,quote:i%2?'Synthetic entry keypad':'Synthetic supply 8V'}));
 const v=run(edge,{sources:[signed({pages:[1,2,3,4,5,6]})]});assert.equal(v.facts.length,12);assert.ok(v.facts.every(f=>f.analysis_eligible));
});

test('inconsistent text or reused identities cannot masquerade as one stable PDF panel',()=>{
 const conflict=productDocument();conflict.product_evidence.regions=[region(),region({text:model+'\nSynthetic supply 8V\nChanged synthetic context'})];blocked(run(conflict),'panel_text_conflict');
 const id=productDocument(),other=region();other.panel_bbox=[0,0,450,300];id.product_evidence.regions=[region(),other];blocked(run(id),'region_identity_conflict');
});

test('equal quotes in different physical regions retain their independent provenance',()=>{
 const d=productDocument(),left=region(),right=region({id:'other-panel'});
 left.panel_bbox=[0,0,300,300];right.panel_bbox=[300,0,600,300];right.headings[0].bbox=[310,10,500,30];right.field.bbox=[310,40,500,60];
 d.product_evidence.regions=[left,right];const v=run(d);assert.equal(v.facts.length,2);assert.notDeepEqual(v.facts[0].native_region.panel_bbox,v.facts[1].native_region.panel_bbox);
 const same=productDocument();same.product_evidence.regions=[region(),region()];assert.equal(run(same).facts.length,1);
});

test('a rejected candidate leaves readable valid evidence but cannot hide a possible contradiction',()=>{
 const d=productDocument(),bad=region({quote:'Synthetic entry keypad'});bad.field.end++;
 d.product_evidence.regions=[region(),bad];const v=run(d);assert.equal(v.facts.length,1);assert.equal(v.facts[0].analysis_eligible,false);blocked(v,'field_quote_invalid');
});

test('source SHA, model and schema failures return fixed diagnostics without returning rejected text',()=>{
 const r=region();r.source_sha256='b'.repeat(64);blocked(check(r),'region_source_mismatch');
 const d=productDocument();d.product_evidence.model='TEST80 MAX';blocked(run(d),'model_scope_mismatch');
 const unknown=productDocument();unknown.product_evidence.schema='other';blocked(run(unknown),'document_schema_invalid');
 const invalid=productDocument();invalid.product_evidence.regions[0].field.quote='SYNTHETIC_REJECTED_CONTENT';
 const v=run(invalid);assert.equal(v.facts.length,0);assert.doesNotMatch(JSON.stringify([v.blocked,v.gaps]),/SYNTHETIC_REJECTED_CONTENT/);
});

test('direct product_evidence objects and normalized source metadata remain supported without a knowledge envelope',()=>{
 const d=productDocument();assert.equal(run(d.product_evidence).facts[0].analysis_eligible,true);
 assert.deepEqual(d,productDocument());
});
