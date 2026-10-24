import {normalizeProductInput,modelCodes,bareModel,materialFields,materialVersion,namedMaterialProducts} from './product-input.mjs';
import {productLedger,productLedgerText} from './product-coverage.mjs';
import {profileEvidence} from './knowledge-profile.mjs';
import {materialQuery,coverageSummary} from './document-knowledge.mjs';
const modelIds=modelCodes;
const fields=materialFields;
export function resolveMaterialTurn(question,history=[]){
 const q=normalizeProductInput(question).trim(),previous=normalizeProductInput(history.at(-1)||'');
 if(!previous&&/^(那它|它|这个型号|该型号)/.test(q)&&fields(q).length)return {question:'物料：'+q,clarification:'请告诉我具体产品型号，或选择上一个型号后继续查询。新需求不会沿用上一段对话的型号。'};
 if(!previous||/换个话题|新话题|不查资料|天气|天空|社媒|网站|询盘|营销|新闻/.test(q))return {question:q};
 const prior=materialQuery(previous),ids=modelIds(q),oldIds=modelIds(previous),properties=fields(q);
 if(/^(下一页|下页|继续看下一页|物料下一页)[。？?！!]*$/.test(q))return {question:`物料：${prior.query} 第${Math.min(10000,prior.page+1)}页`};
 if(/^第\s*\d+\s*页[。？?]*$/.test(q))return {question:`物料：${prior.query} ${q}`};
 if(/^(继续|展开|详细一点|详细说明)[。？?！!]*$/.test(q))return {question:`物料：${prior.query} 第${prior.page}页`,detail:true};
 if(/产品手册|宣传册|产品目录|资料库|物料[:：]|查找|寻找|安装视频|(?:木门|安全门|防盗门|智能锁|门锁|医用门|防火门|防火窗).{0,8}(?:画册|样本)/.test(q)&&! /^(那|它|这个|该型号)/.test(q))return {question:q};
 const followup=/^(那|它|这个|该型号|还有)/.test(q)||q.length<=60&&(properties.length>0||ids.length>0&&(/呢|怎么样|如何/.test(q)||bareModel(q)));
 if(!followup)return {question:q};
 // A literal named product has no model code; retain its file scope and name for short followups.
 if(!ids.length&&namedMaterialProducts(q).length)return {question:'物料：'+q.replace(/^(那|它|这个|该型号|还有)+/,'')};
 const named=namedMaterialProducts(previous);
 if(!ids.length&&oldIds.length<=1&&named.length===1&&!/对比|比较| versus | vs\.? |与|和/.test(previous)){
  const at=prior.query.indexOf(named[0]);
  if(at>=0){const anchor=prior.query.slice(0,at+named[0].length),request=q.replace(/^(那|它|这个|该型号|还有)+/,'').replace(/^的/,'').replace(/[呢。？?！!]+$/,'').trim();return {question:`物料：${anchor} ${request}`.trim()}}
 }
 const target=ids.length?ids:oldIds;
 if(target.length!==1)return {question:'物料：'+q,clarification:'请告诉我具体产品型号，或直接输入“物料：关键词”。当前上下文无法唯一确定你指的是哪款产品。'};
 const version=materialVersion(q)||materialVersion(previous);
 const onlyModel=ids.length===1&&q.replace(/[呢。?!？!]+$/,'').trim().toUpperCase()===ids[0];
 // Keep the user's conditions/negation; field labels alone would erase 'outdoor' or numeric limits.
 const request=onlyModel?fields(previous).join(' '):q.replace(/^(那|它|这个|该型号|还有)+/,'').replace(/^的/,'').replace(/[呢。？?！!]+$/,'').trim();
 return {question:`物料：${ids.length&&!onlyModel?'':target[0]+' '}${request}${version&&!request.includes(version)?' '+version:''}`.trim()};
}
export function evidenceDifferences(assets){
 const groups=new Map();
 for(const asset of assets){if(!asset.isCurrentVersion)continue;
  for(const p of asset.document?.pages||[]){
   const text=p.chunks.join('\n');const declarations=[...text.matchAll(/(?:型号|model)\s*[:：]\s*([A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*)/gi)].map(x=>x[1].toUpperCase());
   const ids=[...new Set(declarations)];if(ids.length!==1)continue;
   for(const f of p.facts){if(!['尺寸','材质','认证','安装','维护'].includes(f.field)||!text.includes(f.quote))continue;
    const key=ids[0]+'|'+f.field,items=groups.get(key)||[];
    if(!items.some(x=>x.quote.replace(/\s/g,'')===f.quote.replace(/\s/g,'')))items.push({quote:f.quote,assetId:asset.id,source:asset.name,location:p.location});groups.set(key,items);
   }
  }
 }
 return [...groups].filter(([,v])=>new Set(v.map(x=>x.assetId)).size>1).slice(0,3).map(([key,v])=>`待核对：${key.replace('|',' · ')}在当前资料中的表述不同，可能涉及条件或版本差异，尚未判定矛盾。\n`+v.slice(0,3).map(x=>`${x.source} / ${x.location}：${x.quote}`).join('\n')).join('\n\n');
}
export function conciseMaterialAnswer(data,question){
 if(/知识覆盖|解析进度|学了多少|了解多少/.test(question))return coverageSummary(data.document_coverage)+'内部资料仅在公司系统内处理。你可以按型号查询参数、安装要求或资料出处。';
 if(!data.assets.length&&data.relevance_filtered)return '本次检索没有找到同时满足你所提条件的资料。未将其他门类、未标注英文或非手册文件充当结果。'+(data.has_more?'本页候选未匹配，仍有后续候选，可说“下一页”继续核对。':'这不代表公司一定没有该资料；可能缺少语言标注或尚未入库。');
 if(!data.assets.length)return '在本次有权检索的资料中没有找到匹配内容，不能据此判断该产品不存在。请提供完整型号，或减少关键词后重试。\n'+coverageSummary(data.document_coverage);
 const wanted=fields(question),blocks=[];
 for(const a of data.assets.slice(0,3)){
  const refs=[],requested=wanted.filter(x=>!['来源','页码','版本'].includes(x));
  for(const f of a.document?.product_understanding?.findings||[]){
   if(!requested.length||requested.some(w=>f.field===w||fields(f.field).includes(w)))refs.push(`[第${f.page}页｜${f.field}，机器解释未人工核验] ${f.value}\n原文依据：${f.quote}`);
   if(refs.length>=3)break;
  }
  const profile=profileEvidence(a.document?.knowledge_profile);if(!refs.length&&!requested.length&&profile)refs.push(profile);if(a.video){for(const segment of (a.video.segments||[]).slice(0,2))refs.push(`[${Math.floor(segment.start/60)}:${String(Math.floor(segment.start%60)).padStart(2,'0')} ${segment.kind==='speech'?'语音转写':segment.kind==='screen_text'?'画面文字':'画面推测'}] ${segment.text.slice(0,420)}`);if(!refs.length)refs.push('视频尚无可引用片段；状态：'+({queued:'排队中',processing:'处理中',failed:'失败',partial:'部分解析',ready:'采样完成'}[a.video.status]||'未解析'))}for(const p of a.document?.pages||[]){
   for(const f of p.facts||[])if((!wanted.length||wanted.some(w=>f.quote.includes(w)||f.field===w))&&p.chunks.join('\n').includes(f.quote))refs.push(`[${p.location}] ${f.quote}`);
   if(!refs.length&&!requested.length&&p.chunks.length)refs.push(`[${p.location}] ${p.chunks[0].slice(0,420)}`);
   if(refs.length>=3)break;
  }
  blocks.push(`${blocks.length+1}. ${a.name}｜${a.versionLabel||'版本未标注'}｜${a.isCurrentVersion?'当前版本':'历史版本'}\n`+(refs.length?refs.slice(0,3).join('\n'):requested.length?'本次返回证据未明确覆盖所问参数，不能据此补充数值或条件。':a.excerpt?'现有索引摘录：'+a.excerpt.slice(0,420):'暂无可用于回答的正文证据。')+(a.document?.status==='partial'?'\n此资料仅部分解析，仍有缺口。':''));
 }
 const differences=evidenceDifferences(data.assets),ledger=productLedgerText(productLedger(data));
 return `已找到本页 ${data.assets.length} 项相关资料，先列出 ${blocks.length} 项证据。以下是原文摘录，不是已核验的产品结论。\n\n`+(ledger?ledger+'\n':'')+blocks.join('\n\n')+(differences?'\n\n'+differences:'')+'\n\n可继续问某型号的具体参数，或说“展开”查看本页详细证据。'+(data.has_more?'说“下一页”继续相同关键词。':'');
}
