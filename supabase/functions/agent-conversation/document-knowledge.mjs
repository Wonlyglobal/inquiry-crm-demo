import {normalizeSlideVisual,slideVisualText} from './slide-visual.mjs';
import {seriesIntent,namedMaterialProducts,materialModelCodes,materialFields} from './product-input.mjs';
import {mentions} from './product-materials.mjs';
import {productEvidence,productEvidenceText} from './product-evidence.mjs';
import {normalizeProfile,profileEvidence} from './knowledge-profile.mjs';
import {materialConstraints} from './material-relevance.mjs';
// Document content never enters an external model. Evidence stays attributed, not a verified claim.
const boundedInt=(n,max=1000000)=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Math.min(Number(n),max):0;
export function materialQuery(question){
 const original=String(question).slice(0,500),page=Number(original.match(/第\s*(\d+)\s*页/)?.[1]||1);
 // A directory request asks for authorized catalogue metadata; instructions about citations are not search terms.
 if(seriesIntent(original))return {query:'',terms:[],page,constraints:materialConstraints(original)};
 if(/^(?:查看|查询|帮我看)?(?:最新物料|最新资料|所有资料|全部资料|公司动态|知识覆盖|产品知识覆盖|解析进度|学了多少|了解多少)[。？?！!]*$/.test(original))return {query:'',terms:[],page};
 const query=original.replace(/^.*?[：:]/,'').replace(/第\s*\d+\s*页/g,'').replace(/最新|最近|当前/g,' ').replace(/帮我|请|找到|查找|找一下|查一下|资料库|物料系统|产品知识|资料|物料|文件|给我|我要|想要|找|王力|我们|我司|介绍一下|介绍|了解|告诉我|是多少|是什么|怎么样|有哪些|如何|多少|的|？|\?/g,' ').trim().slice(0,120);
 const ids=query.match(/[a-z0-9][a-z0-9_-]{1,39}/gi)||[];
 const fields=[['防火','防火'],['隔音','隔音'],['尺寸','尺寸'],['规格','规格'],['材质','材质'],['型号','型号'],['认证','认证'],['安装','安装'],['质保','质保'],['保养','保养'],['参数','参数']].filter(([k])=>query.includes(k)).map(([,v])=>v);
 const named=namedMaterialProducts(original).length>0;
 const neutral=/^(?:what|which|is|are|the|its|about|and|of|sound|insulation|material|materials|thickness|dimensions|size|specifications|parameters|source|reference|page|warranty|lock|options?|colou?rs?|finishes)$/i;
 const searchIds=named?ids.filter(x=>!neutral.test(x)):ids;
 const terms=[...new Set([...searchIds,...(named?[]:fields)])].slice(0,6);
 const constraints=materialConstraints(original);
 return {query,terms:terms.length?terms:[query].filter(Boolean),page,constraints};
}
const NATIVE_FIELDS=new Set(['型号','尺寸','材质','认证','性能','安装','维护','功能','配置','供电','电池','开锁方式','适用条件','厚度','规格','质保','保养','锁选项','颜色','隔音','防火']);
const identity=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s_/-]+/g,'');
// Output chunks stay contiguous source substrings, never joined product/table sections.
function evidenceChunks(chunks,quotes){
 const windows=[],anchors=quotes.map(quote=>({quote,index:chunks.findIndex(c=>c.includes(quote))})).filter(a=>a.quote&&a.index>=0);
 // First retain distinct source chunks. Extra windows from one long chunk cannot evict
 // another chunk's candidate contradiction merely because it appeared later in findings.
 for(const distinct of [true,false])for(const {quote,index} of anchors){
  if(windows.length===3)break;
  if(windows.some(w=>w.text.includes(quote))||distinct&&windows.some(w=>w.index===index))continue;
  const chunk=chunks[index],at=chunk.indexOf(quote),start=Math.max(0,Math.min(at-120,chunk.length-850));
  windows.push({index,start,text:chunk.slice(start,start+850)});
 }
 for(let index=0;index<chunks.length&&windows.length<3;index++)if(!windows.some(w=>w.index===index))windows.push({index,start:0,text:chunks[index].slice(0,850)});
 return {chunks:windows.map(w=>w.text),omitted:Math.max(0,chunks.length-new Set(windows.map(w=>w.index)).size),repositioned:windows.filter(w=>w.start>0).length};
}
export function normalizeDocument(d,question=''){
 if(!d||typeof d!=='object')return null;
 const models=materialModelCodes(question),wanted=materialFields(question).filter(f=>!['来源','页码','版本','参数'].includes(f));
 const inputPages=Array.isArray(d.pages)?d.pages:[];
 const shaped=inputPages.filter(p=>Number.isInteger(p?.page)&&p.page>0&&p.page<=500),total=boundedInt(d.pages_total,100000);
 const pages=shaped.filter(p=>!total||p.page<=total).map(p=>({...p,chunks:(Array.isArray(p.chunks)?p.chunks:[]).map(String)}));
 const pagesByNumber=new Map();for(const p of pages){const list=pagesByNumber.get(p.page)||[];list.push(p);pagesByNumber.set(p.page,list)}
 const supports=f=>f.page<=boundedInt(d.pages_total,100000)&&(pagesByNumber.get(f.page)||[]).some(p=>p.chunks.some(c=>c.includes(f.quote)));
 const requested=f=>wanted.some(w=>f.field===w||materialFields(f.field).includes(w));
 const supportedFinding=f=>supports(f)&&(String(f.value).match(/\d+(?:\.\d+)?/g)||[]).every(n=>f.quote.includes(n));
 const rank=f=>(supportedFinding(f)?8:0)+(models.some(m=>identity(m)===identity(f.model||f.product))?4:0)+(requested(f)?2:0);
 let semanticCandidates=[];const nativeCandidates=[];
 const product_understanding=productEvidence(d.product_understanding,d.sha256,{rank,onCandidates:rows=>{semanticCandidates=rows.filter(supportedFinding)}});
 const selection={pages_invalid:inputPages.length-shaped.length,pages_out_of_range:shaped.length-pages.length,pages_omitted:0,chunks_omitted:0,chunks_repositioned:0,native_facts_omitted:0,native_fact_duplicates:0,native_fields_rejected:0,semantic_findings_invalid:product_understanding?.selection.invalid_findings||0,semantic_finding_duplicates:product_understanding?.selection.duplicate_findings||0,semantic_findings_omitted:product_understanding?.selection.omitted_findings||0,semantic_source_rejected:d.product_understanding&&!product_understanding?1:0,budget_incomplete_fields:0};
 const prepared=pages.map(p=>{
  const raw=Array.isArray(p.facts)?p.facts:[];
  const valid=raw.filter(f=>f&&NATIVE_FIELDS.has(f.field)&&f.kind==='source_excerpt');
  selection.native_fields_rejected+=raw.length-valid.length;
  const nativeRank=f=>(f.quote.trim()&&p.chunks.some(c=>c.includes(f.quote))?8:0)+(models.some(m=>mentions({excerpt:f.quote},m))?4:0)+(requested(f)?2:0);
  const seen=new Set(),unique=valid.map(f=>({field:f.field,quote:String(f.quote||'').slice(0,500)})).filter(f=>{const key=JSON.stringify([f.field,f.quote]);if(seen.has(key))return false;seen.add(key);return true});
  for(const f of unique)if(f.quote.trim()&&p.chunks.some(c=>c.includes(f.quote)))for(const model of models)if(mentions({excerpt:f.quote},model))nativeCandidates.push({...f,model,page:p.page});
  const facts=unique.sort((a,b)=>nativeRank(b)-nativeRank(a)).slice(0,4);
  selection.native_fact_duplicates+=valid.length-unique.length;
  selection.native_facts_omitted+=Math.max(0,unique.length-facts.length);
  const semantic=(product_understanding?.findings||[]).filter(f=>f.page===p.page).sort((a,b)=>rank(b)-rank(a));
  const anchors=[...semantic.filter(supports).map(f=>({quote:f.quote,rank:rank(f)})),...facts.filter(f=>p.chunks.some(c=>c.includes(f.quote))).map(f=>({quote:f.quote,rank:nativeRank(f)}))].sort((a,b)=>b.rank-a.rank).map(f=>f.quote);
  const score=Math.max(0,...semantic.filter(supports).map(rank),...facts.map(nativeRank));
  return {page:p.page,location:String(p.location||'第'+p.page+'页').slice(0,140),kind:['sheet_cells','ocr','native_and_ocr','native_text'].includes(p.kind)?p.kind:'source_text',facts,rawChunks:p.chunks,anchors,score};
 });
 const chosen=prepared.sort((a,b)=>b.score-a.score).slice(0,6);
 selection.pages_omitted=Math.max(0,prepared.length-chosen.length);
 const output=chosen.map(({rawChunks,anchors,score,...p})=>{const window=evidenceChunks(rawChunks,anchors);selection.chunks_omitted+=window.omitted;selection.chunks_repositioned+=window.repositioned;return {...p,chunks:window.chunks}});
 const quoted=f=>output.some(p=>p.page===f.page&&p.chunks.some(c=>c.includes(f.quote)));
 const semanticRetained=f=>(product_understanding?.findings||[]).some(g=>g===f)&&quoted(f);
 const nativeRetained=f=>quoted(f)&&(output.some(p=>p.page===f.page&&p.facts.some(g=>g.field===f.field&&g.quote===f.quote))||semanticCandidates.some(g=>identity(g.model||g.product)===identity(f.model)&&g.field===f.field&&g.page===f.page&&g.quote===f.quote&&semanticRetained(g)));
 const groups=new Map();
 for(const [rows,retained] of [[semanticCandidates,semanticRetained],[nativeCandidates,nativeRetained]])for(const f of rows){const model=identity(f.model||f.product),field=identity(f.field),key=JSON.stringify([model,field]),g=groups.get(key)||{model,field,retained:false,omitted:false};g[retained(f)?'retained':'omitted']=true;groups.set(key,g)}
 // Carry only the field identities that still have displayed values, never omitted quotes/values.
 // Market analysis must withhold that entire field when its returned source candidates were truncated.
 const incomplete_fields=[...groups.values()].filter(g=>g.retained&&g.omitted).map(({model,field})=>({model,field}));
 selection.budget_incomplete_fields=incomplete_fields.length;
 const warnings=[...(incomplete_fields.length?['展示预算未完整保留同字段候选证据，受影响字段不得按剩余值判断一致或形成市场结论。']:[]),...(Array.isArray(d.warnings)?d.warnings:[])].slice(0,4).map(w=>String(w).slice(0,180));
 return {visual_understanding:normalizeSlideVisual(d.visual_understanding,d.sha256),product_understanding,knowledge_profile:normalizeProfile(d.knowledge_profile),warnings,status:['ready','partial','queued','processing','failed'].includes(d.status)?d.status:'not_indexed',pages_total:boundedInt(d.pages_total,100000),pages_processed:boundedInt(d.pages_processed,500),pages_with_text:boundedInt(d.pages_with_text,500),sha256:/^[a-f0-9]{64}$/.test(d.sha256)?d.sha256:'',pages:output,evidence_selection:selection,incomplete_fields};
}
export function documentEvidence(d){
 const labels={ready:'逐页文字提取完成（未人工核验）',partial:'部分提取，仍有缺口',queued:'等待解析',processing:'正在解析',failed:'解析失败',not_indexed:'尚未解析或格式暂不支持'};
 return slideVisualText(d.visual_understanding)+productEvidenceText(d.product_understanding)+profileEvidence(d.knowledge_profile)+'\n'+`文档：${labels[d.status]||labels.not_indexed}；已处理 ${d.pages_processed}/${d.pages_total} 页，有文字 ${d.pages_with_text} 页。${(d.warnings||[]).join('；')}\n`+d.pages.map(p=>`[${p.location}｜${p.kind==='sheet_cells'?'单元格记录':p.kind==='ocr'?'OCR文字，需核对':p.kind==='native_text'?'原文文字（未OCR）':'原文及OCR，需核对'}]\n${p.chunks.join('\n')}\n${p.facts.map(f=>`资料中的${f.field}表述（待核验）：${f.quote}`).join('\n')}`).join('\n')+'\n页码基于内部解析版本；参数、认证、适用条件以原文为准，不将其他型号或历史版本作为当前产品结论。';
}
export function coverageSummary(c){
 if(!c||typeof c!=='object')return '';
 const n=k=>boundedInt(c[k]);
 return `文档/图片覆盖：共 ${n('total')} 项，文字提取完成 ${n('ready')}，部分提取 ${n('partial')}，处理中 ${n('processing')}，排队 ${n('queued')}，失败 ${n('failed')}，未解析/暂不支持 ${n('not_indexed')}。提取完成不等于产品知识已全部核验。\n`+(['semantic_processed','semantic_processing','semantic_partial','semantic_waiting','semantic_deferred'].some(k=>k in c)?`产品信息提取（内部模型，未人工核验）：完成 ${n('semantic_processed')}，进行中 ${n('semantic_processing')}，有缺口 ${n('semantic_partial')}，产品资料排队 ${n('semantic_waiting')}，暂缓 ${n('semantic_deferred')}（未识别出产品手册、型号、门类或参数，暂不处理，不代表与产品无关）。\n`:'');
}
