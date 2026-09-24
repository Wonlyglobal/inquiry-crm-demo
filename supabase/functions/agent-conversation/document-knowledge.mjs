import {normalizeProfile,profileEvidence} from './knowledge-profile.mjs';
import {materialConstraints} from './material-relevance.mjs';
// Document content never enters an external model. Evidence stays attributed, not a verified claim.
const boundedInt=(n,max=1000000)=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Math.min(Number(n),max):0;
export function materialQuery(question){
 const original=String(question).slice(0,500),page=Number(original.match(/第\s*(\d+)\s*页/)?.[1]||1);
 if(/^(?:查看|查询|帮我看)?(?:最新物料|最新资料|所有资料|全部资料|公司动态|知识覆盖|产品知识覆盖|解析进度|学了多少|了解多少)[。？?！!]*$/.test(original))return {query:'',terms:[],page};
 const query=original.replace(/^.*?[：:]/,'').replace(/第\s*\d+\s*页/g,'').replace(/最新|最近|当前/g,' ').replace(/帮我|请|找到|查找|找一下|查一下|资料库|物料系统|产品知识|资料|物料|文件|给我|我要|想要|找|王力|我们|我司|介绍一下|介绍|了解|告诉我|是多少|是什么|怎么样|有哪些|如何|多少|的|？|\?/g,' ').trim().slice(0,120);
 const ids=query.match(/[a-z0-9][a-z0-9_-]{1,39}/gi)||[];
 const fields=[['防火','防火'],['隔音','隔音'],['尺寸','尺寸'],['规格','规格'],['材质','材质'],['型号','型号'],['认证','认证'],['安装','安装'],['质保','质保'],['保养','保养'],['参数','参数']].filter(([k])=>query.includes(k)).map(([,v])=>v);
 const terms=[...new Set([...ids,...fields])].slice(0,6);
 const constraints=materialConstraints(original);
 return {query,terms:terms.length?terms:[query].filter(Boolean),page,constraints};
}
export function normalizeDocument(d){
 if(!d||typeof d!=='object')return null;
 return {knowledge_profile:normalizeProfile(d.knowledge_profile),warnings:(Array.isArray(d.warnings)?d.warnings:[]).slice(0,4).map(w=>String(w).slice(0,180)),status:['ready','partial','queued','processing','failed'].includes(d.status)?d.status:'not_indexed',pages_total:boundedInt(d.pages_total,100000),pages_processed:boundedInt(d.pages_processed,500),pages_with_text:boundedInt(d.pages_with_text,500),sha256:/^[a-f0-9]{64}$/.test(d.sha256)?d.sha256:'',pages:(Array.isArray(d.pages)?d.pages:[]).filter(p=>Number.isInteger(p.page)&&p.page>0&&p.page<=500).slice(0,6).map(p=>({page:p.page,location:String(p.location||'第'+p.page+'页').slice(0,140),kind:['sheet_cells','ocr','native_and_ocr','native_text'].includes(p.kind)?p.kind:'source_text',chunks:(Array.isArray(p.chunks)?p.chunks:[]).slice(0,3).map(s=>String(s).slice(0,850)),facts:(Array.isArray(p.facts)?p.facts:[]).filter(f=>['型号','尺寸','材质','认证','性能','安装','维护'].includes(f.field)&&f.kind==='source_excerpt').slice(0,4).map(f=>({field:f.field,quote:String(f.quote||'').slice(0,500)}))}))};
}
export function documentEvidence(d){
 const labels={ready:'逐页文字提取完成（未人工核验）',partial:'部分提取，仍有缺口',queued:'等待解析',processing:'正在解析',failed:'解析失败',not_indexed:'尚未解析或格式暂不支持'};
 return profileEvidence(d.knowledge_profile)+'\n'+`文档：${labels[d.status]||labels.not_indexed}；已处理 ${d.pages_processed}/${d.pages_total} 页，有文字 ${d.pages_with_text} 页。${(d.warnings||[]).join('；')}\n`+d.pages.map(p=>`[${p.location}｜${p.kind==='sheet_cells'?'单元格记录':p.kind==='ocr'?'OCR文字，需核对':p.kind==='native_text'?'原文文字（未OCR）':'原文及OCR，需核对'}]\n${p.chunks.join('\n')}\n${p.facts.map(f=>`资料中的${f.field}表述（待核验）：${f.quote}`).join('\n')}`).join('\n')+'\n页码基于内部解析版本；参数、认证、适用条件以原文为准，不将其他型号或历史版本作为当前产品结论。';
}
export function coverageSummary(c){
 if(!c||typeof c!=='object')return '';
 const n=k=>boundedInt(c[k]);
 return `文档/图片覆盖：共 ${n('total')} 项，文字提取完成 ${n('ready')}，部分提取 ${n('partial')}，处理中 ${n('processing')}，排队 ${n('queued')}，失败 ${n('failed')}，未解析/暂不支持 ${n('not_indexed')}。提取完成不等于产品知识已全部核验。\n`;
}
