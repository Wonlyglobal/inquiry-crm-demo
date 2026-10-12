// Cross-page ownership candidates require an explicit continuation marker and an unambiguous
// immediately preceding page. Never inject inferred model names into source quotes.
export function crossPageCandidates(models,assets){
 const out=[];const reEscape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const found=text=>models.filter(m=>new RegExp('(^|[^A-Za-z0-9])'+reEscape(m)+'(?![A-Za-z0-9]|[ _-]+(?:PRO|MAX|PLUS|ULTRA|LITE)\\b)','i').test(text));
 for(const a of assets||[]){
  const d=a.document;if(!['ready','partial'].includes(d?.status))continue;
  const pages=[...(d.pages||[])].sort((a,b)=>a.page-b.page);
  for(let i=1;i<pages.length;i++){
   const prev=pages[i-1],page=pages[i],before=(prev.chunks||[]).join('\n'),text=(page.chunks||[]).join('\n');
   if(page.page!==prev.page+1||!/^\s*(?:续表|接上页|表\s*\d+\s*[（(]续[）)]|continued\b)/i.test(text))continue;
   const owners=found(before);if(owners.length!==1||found(text).length)continue;
   // An unknown model heading is ambiguity too; do not treat known-model absence as proof.
   if(/\b[A-Z]{1,5}[- ]?\d{2,}[A-Z0-9-]*\b/i.test(text))continue;
   out.push({model:owners[0],asset:a.name,from:prev.page,to:page.page,status:'needs_review',marker:text.slice(0,60)});
  }
 }
 return out.slice(0,10);
}
export function crossPageText(rows){return rows.length?'\n跨页归属待核对（不作为参数事实或选型依据）：\n'+rows.map(r=>`${r.model}：${r.asset}第${r.from}页→第${r.to}页，有明确续页标记；请对照版式确认。`).join('\n'):''}
