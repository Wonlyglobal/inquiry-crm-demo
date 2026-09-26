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
   // Derived profiles cannot replace page evidence; avoid unsupported model/series claims.
   a.document={...d,pages,knowledge_profile:null,warnings:[...(d.warnings||[]),'仅核对本次授权检索的页码摘录；未独立复验原文件当前哈希或产品事实。']};
  }
  if(a.video){const usable=['ready','partial'].includes(a.video.status);a.video={...a.video,segments:usable?(a.video.segments||[]).filter(s=>Number.isFinite(s.start)&&s.start>=0&&typeof s.text==='string'&&s.text.trim()&&['speech','screen_text','visual_inference'].includes(s.kind)):[]};}
  return a;
 });
 return {...data,assets,evidence_gate:{version:1,rejected,scope:'authorized_response_structure_only',source_freshness_verified:false}};
}
