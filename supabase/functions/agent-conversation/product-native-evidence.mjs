import {materialModelCodes,materialVersion,normalizeProductInput} from './product-input.mjs';

// Company-only, native PDF text. This validates the supplied region structure, not
// pixels, the live file hash, product truth or current availability for sale.
// Offsets are zero-based Unicode code points, with an exclusive end (not UTF-16).
const DOC_SCHEMA='grace-product-page-evidence-v1';
const SHA=/^[a-f0-9]{64}$/;
const chars=s=>Array.from(s);
const canonical=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s_/.-]+/g,'');
const text=(s,max)=>typeof s==='string'&&s.length<=max*2&&s.trim()&&chars(s).length<=max;
const fail=reason=>({fact:null,blocked:[reason],gaps:[]});
const bbox=b=>Array.isArray(b)&&b.length===4&&b.every(n=>typeof n==='number'&&Number.isFinite(n))&&b[0]<b[2]&&b[1]<b[3];
const inside=(b,parent)=>bbox(b)&&bbox(parent)&&b[0]>=parent[0]&&b[1]>=parent[1]&&b[2]<=parent[2]&&b[3]<=parent[3];
const range=(p,t,max)=>p&&text(p.quote,max)&&Number.isSafeInteger(p.start)&&Number.isSafeInteger(p.end)&&p.start>=0&&p.end>p.start&&p.end<=t.length&&t.slice(p.start,p.end).join('')===p.quote;
const editionKey=value=>{
 const edition=materialVersion(value||'');
 if(!edition||canonical(value)!==canonical(edition))return '';
 return canonical(edition).replace(/第([一二三四五六七八九十\d]+)版/g,(_,n)=>'V'+({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[n]||n));
};
const date=value=>{
 if(typeof value!=='string'||value.length>40||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)||!Number.isFinite(Date.parse(value)))return null;
 const [y,m,d]=value.slice(0,10).split('-').map(Number),actual=new Date(Date.UTC(y,m-1,d));
 return actual.getUTCFullYear()===y&&actual.getUTCMonth()===m-1&&actual.getUTCDate()===d?value:null;
};
const stripHeading=s=>s.normalize('NFKC').trim().replace(/^(?:model|型号)\s*[:：]\s*/i,'').replace(/^[\s【\[({]+|[\s】\])}]+$/g,'');
const punctuation=s=>/^[\s:：;；|【】\[\](){}]*$/.test(s.normalize('NFKC'));
const identityOnly=s=>s.normalize('NFKC').split(/\r?\n/).map(line=>line.trim()).filter(line=>/[\p{L}\p{N}]/u.test(line)).every(line=>
 /^(?:型号|名称|产品名称|系列|版次|版本|model|name|series|edition|version)(?:\s*[:：].*|[\s:：;；|.。-]*)$/i.test(line)
 || /^(?:V\s*\d+|第[一二三四五六七八九十\d]+版)[\s:：;；|.。-]*$/i.test(line));

export function validateNativeSourceRegion(raw,{model='',source_sha256=''}={}){
 if(raw?.schema!=='native_region_v1')return fail('region_schema_invalid');
 if(raw.source_kind!=='native_text')return fail('source_kind_unsupported');
 if(raw.offset_unit!=='unicode_codepoint')return fail('offset_unit_invalid');
 if(!SHA.test(raw.source_sha256||''))return fail('source_sha_invalid');
 if(source_sha256&&raw.source_sha256!==source_sha256)return fail('region_source_mismatch');
 if(!text(model,60))return fail('model_scope_invalid');
 if(!Number.isSafeInteger(raw.page)||raw.page<1)return fail('page_invalid');
 if(raw.coordinate_system!=='pdf_points_top_left'||raw.rotation!==0||typeof raw.page_width!=='number'||!Number.isFinite(raw.page_width)||raw.page_width<=0||typeof raw.page_height!=='number'||!Number.isFinite(raw.page_height)||raw.page_height<=0)return fail('page_geometry_invalid');
 if(!inside(raw.panel_bbox,[0,0,raw.page_width,raw.page_height]))return fail('panel_bbox_invalid');
 if(!text(raw.region_id,100))return fail('region_identity_invalid');
 if(!text(raw.native_text,2550))return fail('native_text_invalid');
 const native=chars(raw.native_text);
 if(!Array.isArray(raw.headings)||!raw.headings.length||raw.headings.length>3)return fail('heading_count_invalid');
 if(!raw.field||!text(raw.field.name,60)||!range(raw.field,native,500))return fail('field_quote_invalid');
 if(!inside(raw.field.bbox,raw.panel_bbox))return fail('field_bbox_invalid');
 const headings=[];
 for(const h of raw.headings){
  if(!text(h?.model,60)||!range(h,native,120)||!inside(h.bbox,raw.panel_bbox))return fail('heading_anchor_invalid');
  if(canonical(h.model)!==canonical(model)||canonical(stripHeading(h.quote))!==canonical(model))return fail('heading_model_mismatch');
  const key=JSON.stringify([h.model,h.quote,h.start,h.end,h.bbox]);
  if(!headings.some(g=>g.key===key))headings.push({key,...h});
 }
 if(headings.length!==1)return fail('heading_ambiguous');
 const h=headings[0];
 // A clipped base/Pro anchor cannot hide a Basic/Standard/unknown suffix. Require
 // the complete model heading line, allowing only its label and punctuation around it.
 let lineStart=h.start,lineEnd=h.end;
 while(lineStart>0&&!/[\r\n]/.test(native[lineStart-1]))lineStart--;
 while(lineEnd<native.length&&!/[\r\n]/.test(native[lineEnd]))lineEnd++;
 const before=native.slice(lineStart,h.start).join('').replace(/^\s*(?:model|型号)\s*[:：]\s*/i,'');
 if(!punctuation(before)||!punctuation(native.slice(h.end,lineEnd).join('')))return fail('heading_boundary_invalid');
 if(raw.field.start<h.end&&!(raw.field.start<=h.start&&raw.field.end>h.end))return fail('field_precedes_heading');
 const substantive=native.slice(raw.field.start,raw.field.end).filter((_,i)=>i+raw.field.start<h.start||i+raw.field.start>=h.end).join('').trim();
 if(!/[\p{L}\p{N}]/u.test(substantive)||canonical(substantive)===canonical(raw.field.name)||identityOnly(substantive))return fail('field_identity_only');
 // A whole-page panel is insufficient when heading and field occupy disjoint columns.
 if(Math.min(h.bbox[2],raw.field.bbox[2])<=Math.max(h.bbox[0],raw.field.bbox[0])||raw.field.bbox[3]<h.bbox[1])return fail('cross_column_binding');
 // Examine every model-like reference, not just rows that look like known model-only
 // headings. Mask only the already checked full anchor. Unknown trailing letters are
 // ambiguous variants, never a reason to ignore a foreign code or borrow its fields.
 const remaining=normalizeProductInput([...native.slice(0,h.start),...' '.repeat(h.end-h.start),...native.slice(h.end)].join(''));
 for(const m of remaining.matchAll(/\b[A-Za-z][A-Za-z0-9_-]{0,38}\d[A-Za-z0-9_-]*\b(?:[ \t_-]*(?:pro|max|plus|ultra|lite|basic|standard)\b)?/gi)){
  const code=materialModelCodes(m[0])[0];if(!code)continue;
  if(canonical(code)!==canonical(model))return fail('non_target_model_reference');
  if(/^[ \t_/.-]+[A-Za-z][A-Za-z0-9_-]*\b/.test(remaining.slice(m.index+m[0].length)))return fail('ambiguous_model_reference');
 }
 // An unlisted model-only row is ambiguous, even if a producer puts it inside the
 // field quote. Do not silently use a second model heading as a parameter value.
 let at=0;
 for(const line of raw.native_text.split('\n')){
  const length=chars(line).length,end=at+length,clean=stripHeading(line),codes=materialModelCodes(clean);
  const headingLine=codes.length===1&&canonical(clean)===canonical(codes[0]);
  const sameAnchor=at<h.end&&end>h.start;
  if(headingLine&&!sameAnchor)return fail('unlisted_model_heading');
  at=end+1;
 }
 const anchor={model:h.model,quote:h.quote,start:h.start,end:h.end,bbox:[...h.bbox]};
 const region={schema:'native_region_v1',source_kind:'native_text',source_sha256:raw.source_sha256,page:raw.page,page_width:raw.page_width,page_height:raw.page_height,coordinate_system:'pdf_points_top_left',offset_unit:'unicode_codepoint',rotation:0,panel_bbox:[...raw.panel_bbox],native_text:raw.native_text,headings:[anchor],field:{name:raw.field.name,quote:raw.field.quote,start:raw.field.start,end:raw.field.end,bbox:[...raw.field.bbox]},region_id:raw.region_id};
 return {fact:{model,field:raw.field.name,value:raw.field.quote,source_page:raw.page,source_quote:raw.field.quote,source_kind:'native_region',sha256:raw.source_sha256,native_region:region,human_verified:false,analysis_eligible:false},blocked:[],gaps:[]};
}

export function nativeProductEvidence(doc,{model='',edition='',sources=[]}={}){
 const facts=[],blocked=[],gaps=new Set(),result=()=>({facts,blocked,gaps:[...gaps],scope:'native_only',human_verified:false,source_freshness_verified:false});
 const reject=reason=>{blocked.push({index:-1,reason});gaps.add(reason);return result()};
 const raw=doc?.product_evidence||doc;
 if(raw?.schema!==DOC_SCHEMA)return reject('document_schema_invalid');
 if(doc?.product_evidence&&(doc.kind&&doc.kind!=='product'||doc.source_sha256&&doc.source_sha256!==raw.source_sha256))return reject('document_source_mismatch');
 if(!text(model,60)||!text(raw.model,60)||canonical(raw.model)!==canonical(model))return reject('model_scope_mismatch');
 if(!SHA.test(raw.source_sha256||''))return reject('source_sha_invalid');
 if(!text(raw.source_name,200)||raw.source_edition!==null&&raw.source_edition!==undefined&&(typeof raw.source_edition!=='string'||raw.source_edition.length>160))return reject('source_metadata_invalid');
 const actualEdition=editionKey(raw.source_edition),requestedEdition=editionKey(edition);
 if(edition&&(!requestedEdition||requestedEdition!==actualEdition))return reject('edition_scope_mismatch');
 if(!Array.isArray(raw.regions)||raw.regions.length>12)return reject('region_budget_exceeded');
 if(new Set(raw.regions.map(r=>r?.page).filter(Number.isSafeInteger)).size>6)return reject('page_budget_exceeded');
 const pageFields=new Map(),pageTexts=new Map(),panels=new Map(),regionIds=new Map();
 for(const r of raw.regions){
  if(!Number.isSafeInteger(r?.page)||typeof r.native_text!=='string'||!bbox(r.panel_bbox)||!text(r.region_id,100))continue;
  if(r.native_text.length>5100)return reject('native_text_invalid');
  pageFields.set(r.page,(pageFields.get(r.page)||0)+1);
  if(pageFields.get(r.page)>4)return reject('field_budget_exceeded');
  const panelKey=JSON.stringify([r.page,r.panel_bbox]),prior=panels.get(panelKey);
  const idKey=JSON.stringify([r.page,r.region_id]);
  if(regionIds.has(idKey)&&regionIds.get(idKey)!==panelKey)return reject('region_identity_conflict');
  regionIds.set(idKey,panelKey);
  if(prior!==undefined&&prior!==r.native_text)return reject('panel_text_conflict');
  if(prior===undefined){panels.set(panelKey,r.native_text);pageTexts.set(r.page,(pageTexts.get(r.page)||0)+chars(r.native_text).length)}
  if(pageTexts.get(r.page)>2550)return reject('page_text_budget_exceeded');
 }
 const published=date(raw.source_published_at),updated=date(raw.source_updated_at),extracted=date(raw.extracted_at);
 if(!actualEdition)gaps.add('source_edition_unknown');
 if(!published)gaps.add('source_publication_date_unknown');
 if(!updated)gaps.add('source_update_date_unknown');
 if(!extracted)gaps.add('extraction_date_unknown');
 if(Array.isArray(raw.gaps)&&raw.gaps.length)gaps.add('recorded_source_gaps');
 const trusted=Array.isArray(sources)?sources.filter(s=>s?.signed_source===true&&s.sha256===raw.source_sha256&&actualEdition&&editionKey(s.edition)===actualEdition):[];
 const seen=new Set();
 for(let index=0;index<raw.regions.length;index++){
  const checked=validateNativeSourceRegion(raw.regions[index],{model,source_sha256:raw.source_sha256});
  if(!checked.fact){for(const reason of checked.blocked){blocked.push({index,reason});gaps.add(reason)}continue}
  const f=checked.fact,matching=trusted.filter(s=>Array.isArray(s.pages)&&s.pages.some(p=>Number.isSafeInteger(p)&&p===f.source_page)),current=matching.some(s=>s.is_current_version===true);
  if(!matching.length)gaps.add('signed_source_page_unmatched');
  else if(!current)gaps.add('source_current_unconfirmed');
  const key=JSON.stringify([f.sha256,actualEdition,f.source_page,f.native_region.panel_bbox,f.native_region.field.bbox,f.field,f.native_region.field.start,f.native_region.field.end,f.source_quote]);
  if(seen.has(key))continue;seen.add(key);
  facts.push({...f,ref:raw.source_name+' 第'+f.source_page+'页',edition:raw.source_edition||null,date:updated,published_at:published,extracted_at:extracted,current,source_match:matching.length>0,analysis_eligible:current});
 }
 // Invalid candidates may conceal a same-field contradiction; keep valid excerpts
 // readable but withhold analysis until the submitted coverage is repaired.
 if(blocked.length)for(const f of facts)f.analysis_eligible=false;
 if(!facts.length)gaps.add('no_accepted_native_regions');
 return result();
}
