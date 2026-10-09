// Runs after authorized retrieval, before any material renderer or client payload.
// Validates returned evidence structure, not source truth or live-file hashes.
export function gateMaterialEvidence(data){
 if(data.status!=='available')return data;
 let rejected=0;
 const assets=data.assets.map(asset=>{
  const a={...asset,excerpt:''}; // unlocated index excerpts are not answer evidence
  if(a.document){
   const d=a.document;const usable=['ready','partial'].includes(d.status)&&/^[a-f0-9]{64}$/.test(d.sha256||'');
   const pages=usable?(d.pages||[]).filter(p=>Number.isInteger(p.page)&&p.page>0&&p.page<=d.pages_total).map(p=>{
    const chunks=[...new Set((p.chunks||[]).filter(x=>typeof x==='string'&&x.trim()))];
    const facts=(p.facts||[]).filter(f=>{const ok=typeof f.quote==='string'&&f.quote.trim()&&chunks.some(c=>c.includes(f.quote));if(!ok)rejected++;return ok});
    return {...p,location:`第${p.page}页${p.kind==='sheet_cells'?'（单元格提取）':''}`,chunks,facts};
   }):[];
   if(!usable)rejected+=(d.pages||[]).length;
   // Machine product interpretations survive only when their quote is on a page returned
   // in this response; numbers in the interpretation must appear in the quote itself.
   let product_understanding=null;
   if(usable&&d.product_understanding){
    const u=d.product_understanding;let hidden=0;
    const findings=(u.findings||[]).filter(f=>{
     const page=pages.find(p=>p.page===f.page);
     if(!page){hidden++;return false}
     const quoted=page.chunks.some(c=>c.includes(f.quote));
     const numbers=(String(f.value).match(/\d+(?:\.\d+)?/g)||[]).every(n=>f.quote.includes(n));
     const named=f.quote.includes(f.product);
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
 return {...data,assets,evidence_gate:{version:1,rejected,scope:'authorized_response_structure_only',source_freshness_verified:false}};
}
