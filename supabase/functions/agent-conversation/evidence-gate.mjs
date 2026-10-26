import {sourceNamesModel,findingModelMatchesProduct} from './product-materials.mjs';
// Runs after authorized retrieval, before any material renderer or client payload.
// Validates returned evidence structure, not source truth or live-file hashes.
export const EVIDENCE_DIAGNOSTIC_KEYS=['pages_invalid','pages_out_of_range','pages_omitted','chunks_omitted','chunks_repositioned','native_facts_omitted','native_fact_duplicates','native_fields_rejected','semantic_findings_invalid','semantic_finding_duplicates','semantic_findings_omitted','semantic_source_rejected','budget_incomplete_fields','unusable_document_pages','native_quote_missing','semantic_page_missing','semantic_quote_missing','semantic_number_missing','semantic_product_missing'];
export function gateMaterialEvidence(data){
 if(data.status!=='available')return data;
 let rejected=0;
 const diagnostics=Object.fromEntries(EVIDENCE_DIAGNOSTIC_KEYS.map(k=>[k,0]));
 const assets=data.assets.map(asset=>{
  const a={...asset,excerpt:''}; // unlocated index excerpts are not answer evidence
  if(a.document){
   const d=a.document;const usable=['ready','partial'].includes(d.status)&&/^[a-f0-9]{64}$/.test(d.sha256||'');
   for(const k of EVIDENCE_DIAGNOSTIC_KEYS){const n=d.evidence_selection?.[k];if(Number.isSafeInteger(n)&&n>=0)diagnostics[k]+=Math.min(n,1000000)}
   if(usable)diagnostics.pages_out_of_range+=(d.pages||[]).filter(p=>!Number.isInteger(p.page)||p.page<1||p.page>d.pages_total).length;
   const pages=usable?(d.pages||[]).filter(p=>Number.isInteger(p.page)&&p.page>0&&p.page<=d.pages_total).map(p=>{
    const chunks=[...new Set((p.chunks||[]).filter(x=>typeof x==='string'&&x.trim()))];
    const facts=(p.facts||[]).filter(f=>{const ok=typeof f.quote==='string'&&f.quote.trim()&&chunks.some(c=>c.includes(f.quote));if(!ok){rejected++;diagnostics.native_quote_missing++}return ok});
    return {...p,location:`第${p.page}页${p.kind==='sheet_cells'?'（单元格提取）':''}`,chunks,facts};
   }):[];
   if(!usable){rejected+=(d.pages||[]).length;diagnostics.unusable_document_pages+=(d.pages||[]).length}
   // Machine product interpretations survive only when their quote is on a page returned
   // in this response; numbers in the interpretation must appear in the quote itself.
   let product_understanding=null;
   if(usable&&d.product_understanding){
    const u=d.product_understanding;let hidden=0;
    const findings=(u.findings||[]).filter(f=>{
     const page=pages.find(p=>p.page===f.page);
     if(!page){hidden++;diagnostics.semantic_page_missing++;return false}
     const quoted=page.chunks.some(c=>c.includes(f.quote));
     const numbers=(String(f.value).match(/\d+(?:\.\d+)?/g)||[]).every(n=>f.quote.includes(n));
     const named=f.quote.includes(f.product)&&findingModelMatchesProduct(f)&&sourceNamesModel(page.chunks,f.quote,f.model||f.product);
     if(!quoted)diagnostics.semantic_quote_missing++;
     if(!numbers)diagnostics.semantic_number_missing++;
     if(!named)diagnostics.semantic_product_missing++;
     if(!(quoted&&numbers&&named)){rejected++;return false}
     return true;
    }).map(f=>({...f,human_verified:false}));
    product_understanding={...u,findings,hidden_findings:hidden,human_verified:false};
   }
   // Derived profiles cannot replace page evidence; avoid unsupported model/series claims.
   // Category labels only route public research; they are not shown as product claims.
   const research_categories=[...new Set((d.knowledge_profile?.categories||[]).map(x=>x?.value).filter(v=>['fire_door','security_door','medical_door','smart_lock'].includes(v)))];
   a.document={...d,pages,product_understanding,research_categories,knowledge_profile:null,warnings:[...(d.warnings||[]),'仅核对本次授权检索的页码摘录；未独立复验原文件当前哈希或产品事实。']};
  }
  if(a.video){const usable=['ready','partial'].includes(a.video.status);a.video={...a.video,segments:usable?(a.video.segments||[]).filter(s=>Number.isFinite(s.start)&&s.start>=0&&typeof s.text==='string'&&s.text.trim()&&['speech','screen_text','visual_inference'].includes(s.kind)):[]};}
  return a;
 });
 return {...data,assets,evidence_gate:{version:1,rejected,diagnostics,scope:'authorized_response_structure_only',source_freshness_verified:false}};
}
