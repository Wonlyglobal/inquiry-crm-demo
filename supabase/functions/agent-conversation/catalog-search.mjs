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
 [/制造|生产工艺|manufactur/i,['制造','工艺','manufactur','production']],
 [/涂层|涂装|coating/i,['涂层','涂装','coating','painting']],
 [/技术|technology/i,['技术','technology','technical']],
 [/设计|结构|design|structure/i,['设计','结构','design','structure']],
 [/节能|环保|可持续|sustainab/i,['节能','环保','energy','environment','sustainab']],
 [/安装|维护|install|maintenance/i,['安装','维护','install','maintenance']]
];
export function searchCatalogue(question,catalog,{models=[]}={}){
 const q=String(question||'').normalize('NFKC').slice(0,500);
 const terms=models.length?models:q.match(/[A-Za-z][A-Za-z0-9.-]{2,}/g)?.filter(x=>! /^(?:the|and|for|what|which|wonly|pdf|does|how|many|please|describe|explain|about|tell|our|uses?|with|are|can|has|have|from|this|that|its|their|all|provide)$/i.test(x))||[];
 if(!models.length)for(const [re,words] of TOPICS)if(re.test(q))terms.push(...words);
 if(!models.length){
  const stop=/^(?:王力|我们|我司|画册|公司|产品|资料|介绍|说明|哪些|什么|多少|情况|请问|查询|查找|查看|有没有|是否|如何|怎么|具体|一下|全部|所有|来源|缺口|页码)$/;
  // Word segmentation keeps unfamiliar Chinese subjects searchable without a topic allowlist.
  const parts=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh',{granularity:'word'}).segment(q)]:[...q].map(segment=>({segment,isWordLike:/\p{Script=Han}/u.test(segment)}));
  for(const part of parts)if(part.isWordLike&&/[\p{Script=Han}]/u.test(part.segment)&&part.segment.length>=2&&!stop.test(part.segment))terms.push(part.segment);
  for(let i=1;i<parts.length;i++)if(parts[i-1].isWordLike&&parts[i].isWordLike&&/^\p{Script=Han}$/u.test(parts[i-1].segment)&&/^\p{Script=Han}$/u.test(parts[i].segment)&&!stop.test(parts[i-1].segment+parts[i].segment))terms.push(parts[i-1].segment+parts[i].segment);
 }
 const unique=[...new Set(terms.map(w=>w.toLowerCase()))].slice(0,64);
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
 return `检索覆盖：全部 ${c.sources} 本已授权画册索引，已检索 ${c.records_searched} 条页面/事实/产品记录、${c.indexed_pages} 个已索引页；原册登记 ${c.declared_pages||'未标注'} 页。关键词匹配 ${c.matches} 条索引记录（可能同页重复，不是产品或项目数量）；展示结果有条数限制。未解析页、图片文字、其他版本和地名同义词仍可能有缺口，未检出不能证明不存在。`;
}
export function catalogueSearchFallback(result,{ref}){
 if(!result.coverage.terms.length)return '本次尚未提取到可用的检索词，不能判断是否有对应资料；请补充产品、主题或原文用词。';
 const seen=new Set(),out=[];
 for(const row of result.hits){
  const key=row.catalog+'|'+row.page;if(seen.has(key))continue;seen.add(key);
  const text=row.text,term=result.coverage.terms.find(w=>text.toLowerCase().includes(w)),at=term?text.toLowerCase().indexOf(term):0;
  out.push(`- ${ref(row.catalog,row.page)}：${text.slice(Math.max(0,at-80),at+300)}`);if(out.length===6)break;
 }
 return out.length?`全画册索引检索线索（共 ${result.hits.length} 条匹配记录，本次列出 ${out.length} 个不同来源页；原文/OCR未人工核验，不能自动作为产品结论）：\n`+out.join('\n\n'):'本次全画册索引未检出可引用证据，不能据此回答“没有”。需要继续核对未解析原页或对应的现行物料版本。';
}
