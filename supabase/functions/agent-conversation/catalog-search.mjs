// Full-scope search over the existing private index, before bounded rendering.
// It is not a claim that every PDF page has been extracted or every source is current.
const TOPICS=[
 [/标杆|地标|案例|项目/,['项目','案例','landmark','project','reference']],
 [/专利|patent/i,['专利','patent']],[/研发|research/i,['研发','research','r&d']],
 [/产能|年产|capacity/i,['产能','年产','capacity','annual production']],
 [/成立|创立|found/i,['成立','创立','founded','established']],
 [/认证|证书|标准|certif/i,['认证','证书','certif','standard']],
 [/隔音|声学|acoustic/i,['隔音','声学','acoustic','sound insulation']],
 [/尺寸|厚度|dimensions?|thickness/i,['尺寸','厚度','dimension','thickness']],
 [/材质|材料|material/i,['材质','材料','material']],
 [/安装|维护|install|maintenance/i,['安装','维护','install','maintenance']]
];
export function searchCatalogue(question,catalog,{models=[]}={}){
 const q=String(question||'').normalize('NFKC').slice(0,500);
 const terms=models.length?models:q.match(/[A-Za-z][A-Za-z0-9.-]{2,}/g)?.filter(x=>! /^(?:the|and|for|what|which|wonly|pdf)$/i.test(x))||[];
 if(!models.length)for(const [re,words] of TOPICS)if(re.test(q))terms.push(...words);
 const unique=[...new Set(terms.map(w=>w.toLowerCase()))];
 const sources=catalog?.sources||[],ids=new Set(sources.map(s=>s.id));
 const rows=[...(catalog?.pages||[]).map(p=>({...p,kind:'page'})),...(catalog?.facts||[]).map(p=>({...p,kind:'fact'})),...(catalog?.products||[]).map(p=>({...p,text:[p.model,p.name,p.series,JSON.stringify(p.specs||{})].filter(Boolean).join(' '),kind:'product'}))];
 const hits=[];let checked=0;
 for(const row of rows){
  if(!ids.has(row.catalog)||!Number.isInteger(row.page)||row.page<1||typeof row.text!=='string')continue;
  checked++;const text=row.text.toLowerCase();
  const matches=unique.filter(w=>text.includes(w));if(matches.length)hits.push({...row,score:matches.length});
 }
 hits.sort((a,b)=>b.score-a.score||a.page-b.page);
 return {hits,coverage:{sources:ids.size,records_searched:checked,indexed_pages:new Set((catalog?.pages||[]).filter(p=>ids.has(p.catalog)).map(p=>p.catalog+'|'+p.page)).size,declared_pages:sources.reduce((n,s)=>n+(Number.isInteger(s.pages)?s.pages:0),0),matches:hits.length,terms:unique}};
}
export function catalogueSearchCoverage(result){
 const c=result.coverage;
 return `检索覆盖：全部 ${c.sources} 本已授权画册索引，已检索 ${c.records_searched} 条页面/事实/产品记录、${c.indexed_pages} 个已索引页；原册登记 ${c.declared_pages||'未标注'} 页。未解析页、图片文字、其他版本和地名同义词仍可能有缺口，未检出不能证明不存在。`;
}
export function catalogueSearchFallback(result,{ref}){
 const seen=new Set(),out=[];
 for(const row of result.hits){
  const key=row.catalog+'|'+row.page;if(seen.has(key))continue;seen.add(key);
  const text=row.text,term=result.coverage.terms.find(w=>text.toLowerCase().includes(w)),at=term?text.toLowerCase().indexOf(term):0;
  out.push(`- ${ref(row.catalog,row.page)}：${text.slice(Math.max(0,at-80),at+300)}`);if(out.length===6)break;
 }
 return out.length?'全画册索引检索线索（原文/OCR未人工核验，不能自动作为产品结论）：\n'+out.join('\n\n'):'本次全画册索引未检出可引用证据，不能据此回答“没有”。需要继续核对未解析原页或对应的现行物料版本。';
}
