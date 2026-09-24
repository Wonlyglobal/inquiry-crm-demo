import {profileEvidence} from './knowledge-profile.mjs';
import {materialQuery,coverageSummary} from './document-knowledge.mjs';
const modelIds=q=>[...new Set((String(q).match(/\b[A-Za-z][A-Za-z0-9_-]{0,38}\d[A-Za-z0-9_-]*\b/g)||[]).map(x=>x.toUpperCase()))].slice(0,4);
const fields=q=>['防火','隔音','尺寸','规格','材质','型号','认证','安装','质保','保养','参数'].filter(x=>String(q).includes(x));
export function resolveMaterialTurn(question,history=[]){
 const q=String(question).trim(),previous=history.at(-1)||'';
 if(!previous||/换个话题|新话题|不查资料|天气|天空|社媒|网站|询盘|营销|新闻/.test(q))return {question:q};
 const prior=materialQuery(previous),ids=modelIds(q),oldIds=modelIds(previous),properties=fields(q);
 if(/^(下一页|下页|继续看下一页|物料下一页)[。？?！!]*$/.test(q))return {question:`物料：${prior.query} 第${Math.min(10000,prior.page+1)}页`};
 if(/^第\s*\d+\s*页[。？?]*$/.test(q))return {question:`物料：${prior.query} ${q}`};
 if(/^(继续|展开|详细一点|详细说明)[。？?！!]*$/.test(q))return {question:`物料：${prior.query} 第${prior.page}页`,detail:true};
 const followup=/^(那|它|这个|该型号|还有)/.test(q)||q.length<=35&&(properties.length>0||ids.length>0&&/呢|怎么样|如何/.test(q));
 if(!followup)return {question:q};
 const target=ids.length?ids:oldIds;
 if(target.length!==1)return {question:'物料：'+q,clarification:'请告诉我具体产品型号，或直接输入“物料：关键词”。当前上下文无法唯一确定你指的是哪款产品。'};
 return {question:`物料：${target[0]} ${properties.length?properties.join(' '):ids.length?fields(previous).join(' '):q.replace(/^(那|它|这个|该型号|还有)+/,'').trim()}`};
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
  const refs=[];const profile=profileEvidence(a.document?.knowledge_profile);if(profile)refs.push(profile);if(a.video){for(const segment of (a.video.segments||[]).slice(0,2))refs.push(`[${Math.floor(segment.start/60)}:${String(Math.floor(segment.start%60)).padStart(2,'0')} ${segment.kind==='speech'?'语音转写':segment.kind==='screen_text'?'画面文字':'画面推测'}] ${segment.text.slice(0,420)}`);if(!refs.length)refs.push('视频尚无可引用片段；状态：'+({queued:'排队中',processing:'处理中',failed:'失败',partial:'部分解析',ready:'采样完成'}[a.video.status]||'未解析'))}for(const p of a.document?.pages||[]){
   for(const f of p.facts||[])if((!wanted.length||wanted.some(w=>f.quote.includes(w)||f.field===w))&&p.chunks.join('\n').includes(f.quote))refs.push(`[${p.location}] ${f.quote}`);
   if(!refs.length&&p.chunks.length)refs.push(`[${p.location}] ${p.chunks[0].slice(0,420)}`);
   if(refs.length>=3)break;
  }
  blocks.push(`${blocks.length+1}. ${a.name}｜${a.versionLabel||'版本未标注'}｜${a.isCurrentVersion?'当前版本':'历史版本'}\n`+(refs.length?refs.slice(0,3).join('\n'):a.excerpt?'现有索引摘录：'+a.excerpt.slice(0,420):'暂无可用于回答的正文证据。')+(a.document?.status==='partial'?'\n此资料仅部分解析，仍有缺口。':''));
 }
 const differences=evidenceDifferences(data.assets);
 return `已找到本页 ${data.assets.length} 项相关资料，先列出 ${blocks.length} 项证据。以下是原文摘录，不是已核验的产品结论。\n\n`+blocks.join('\n\n')+(differences?'\n\n'+differences:'')+'\n\n可继续问某型号的具体参数，或说“展开”查看本页详细证据。'+(data.has_more?'说“下一页”继续相同关键词。':'');
}
