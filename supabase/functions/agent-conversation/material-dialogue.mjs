import {trainingAnswer} from './training-answer.mjs';
import {documentTopicTerms,woodTrainingQuestion} from './document-topic.mjs';
import {productParameterAnswer} from './product-parameter-answer.mjs';
import {visualQuestion,slideVisualText} from './slide-visual.mjs';
import {normalizeProductInput,materialModelCodes,bareModel,materialFields,materialVersion,namedMaterialProducts,catalogueFieldQuestion,catalogueNamedSubject} from './product-input.mjs';
import {productLedger} from './product-coverage.mjs';
import {materialQuery,coverageSummary} from './document-knowledge.mjs';
const modelIds=materialModelCodes;
const fields=materialFields;
export function resolveMaterialTurn(question,history=[]){
 const q=normalizeProductInput(question).trim(),previous=normalizeProductInput(history.at(-1)||'');
 if(!previous&&/^(那它|它|这个型号|该型号)/.test(q)&&fields(q).length)return {question:'物料：'+q,clarification:'请告诉我具体产品型号，或选择上一个型号后继续查询。新需求不会沿用上一段对话的型号。'};
 if(!previous||/换个话题|新话题|不查资料|天气|天空|社媒|网站|询盘|营销|新闻/.test(q))return {question:q};
 if(/王力|WONLY|我司|我们公司/i.test(q)&&/研发|产能|生产基地|未来工厂|品牌价值|设计奖|专利|上市|成立|服务网点|开锁挑战|参与标准|三防分离|远感技术|锁芯等级/.test(q)&&!modelIds(q).length)return {question:q};
 const prior=materialQuery(previous),ids=modelIds(q),oldIds=modelIds(previous),properties=fields(q);
 if(/^(下一页|下页|继续看下一页|物料下一页)[。？?！!]*$/.test(q))return {question:`物料：${prior.query} 第${Math.min(10000,prior.page+1)}页`};
 if(/^第\s*\d+\s*页[。？?]*$/.test(q))return {question:`物料：${prior.query} ${q}`};
 if(/^(继续|展开|详细一点|详细说明)[。？?！!]*$/.test(q))return {question:`物料：${prior.query} 第${prior.page}页`,detail:true};
 if(/产品手册|宣传册|产品目录|资料库|物料[:：]|查找|寻找|安装视频|(?:木门|安全门|防盗门|智能锁|门锁|医用门|防火门|防火窗).{0,8}(?:画册|样本)/.test(q)&&! /^(那|它|这个|该型号)/.test(q))return {question:q};
 if(!ids.length&&woodTrainingQuestion(q))return {question:q};
 // Training followups do not require a model. Carry only an unambiguous
 // product scope, never the previous answer or an unrelated product's facts.
 if(!ids.length&&!oldIds.length&&/木门/.test(previous)&&documentTopicTerms(q).length&&q.length<=60&&!/木门|安全门|防盗门|智能锁|门锁|医用门|防火门|防火窗|窗户|对比|比较/.test(q)&&!/安全门|防盗门|智能锁|门锁|医用门|防火门|防火窗|窗户|对比|比较/.test(previous)){
  const request=q.replace(/^(那|它|这个|还有)+/,'').replace(/^的/,'');
  const version=materialVersion(q)||materialVersion(previous);
  return {question:`物料：木门 ${request}${version&&!request.includes(version)?' '+version:''}`};
 }
 const followup=/^(那|它|这个|该型号|还有)/.test(q)||q.length<=60&&(properties.length>0||ids.length>0&&(/呢|怎么样|如何/.test(q)||bareModel(q)));
 if(!followup)return {question:q};
 // A literal named product has no model code; retain its file scope and name for short followups.
 const priorNamed=catalogueNamedSubject(previous);
 if(!ids.length&&!oldIds.length&&priorNamed&&catalogueFieldQuestion(q)&&/^(那|它|这个|该型号)/.test(q)&&!/对比|比较|以及|和另一款/.test(previous)){
  const request=q.replace(/^(那|它|这个|该型号)+/,'').replace(/^的/,'').replace(/[呢。？?！!]+$/,'').trim();
  const version=materialVersion(q)||materialVersion(previous);
  return {question:`物料：${priorNamed} 的${request}${version&&!request.includes(version)?' '+version:''}`};
 }
 if(!ids.length&&namedMaterialProducts(q).length)return {question:'物料：'+q.replace(/^(那|它|这个|该型号|还有)+/,'')};
 const named=namedMaterialProducts(previous);
 if(!ids.length&&oldIds.length<=1&&named.length===1&&!/对比|比较| versus | vs\.? /.test(previous)){
  const at=prior.query.indexOf(named[0]);
  if(at>=0){const anchor=prior.query.slice(0,at+named[0].length),request=q.replace(/^(那|它|这个|该型号|还有)+/,'').replace(/^的/,'').replace(/[呢。？?！!]+$/,'').trim();return {question:`物料：${anchor} ${request}`.trim()}}
 }
 const target=ids.length?ids:oldIds;
 if(target.length!==1)return {question:'物料：'+q,clarification:'请告诉我具体产品型号，或直接输入“物料：关键词”。当前上下文无法唯一确定你指的是哪款产品。'};
 const priorAt=prior.query.toUpperCase().indexOf(target[0]);
 const fileAnchor=!ids.length&&priorAt>0&&/[._]|20\d{6}/.test(prior.query.slice(0,priorAt))?prior.query.slice(0,priorAt):'';
 const version=materialVersion(q)||materialVersion(previous);
 const onlyModel=ids.length===1&&q.replace(/[呢。?!？!]+$/,'').trim().toUpperCase()===ids[0];
 // Keep the user's conditions/negation; field labels alone would erase 'outdoor' or numeric limits.
 const request=onlyModel?fields(previous).join(' '):q.replace(/^(那|它|这个|该型号|还有)+/,'').replace(/^的/,'').replace(/[呢。？?！!]+$/,'').trim();
 return {question:`物料：${fileAnchor}${ids.length&&!onlyModel?'':target[0]+' '}${request}${version&&!request.includes(version)?' '+version:''}`.trim()};
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
// Direct parameter replies use only the normalized, source-gated product findings.
// Full source excerpts remain available through the existing explicit detail action.
export function directMaterialParameterAnswer(data,question){
 const named=namedMaterialProducts(question),codes=materialModelCodes(question);
 const targets=named.length?named:codes;
 const requested=fields(question).filter(x=>!['来源','页码','版本'].includes(x));
 if(named.length!==1||targets.length!==1||!requested.length||data.status!=='available')return null;
 const target=targets[0],matches=[],covered=new Set();
 for(const a of data.assets||[]){
  if(!a.isCurrentVersion)continue;
  for(const f of a.document?.product_understanding?.findings||[]){
   if(String(f.product).toLowerCase()!==target.toLowerCase())continue;
   const relevant=requested.filter(w=>f.field===w||fields(f.field).includes(w));
   if(!relevant.length||!Number.isInteger(f.page)||typeof f.value!=='string'||!f.value.trim())continue;
   const key=[f.field,f.value,a.id,f.page].join('|');if(matches.some(m=>m.key===key))continue;
   matches.push({key,f,a,relevant});
  }
 }
 const hidden=(data.assets||[]).some(a=>Number(a.document?.product_understanding?.hidden_findings)>0);
 if(!matches.length)return `${target}的${requested.join('、')}：本次返回证据未明确覆盖所问参数，暂不能确定。\n来源缺口：当前返回的资料没有可用于这一回答的参数证据。${hidden?'未通过来源校验的证据已隐藏。':''}`;
 const chosen=matches.slice(0,3);for(const m of chosen)for(const w of m.relevant)covered.add(w);
 const lines=chosen.map(({f,a})=>`${target}｜${f.field}：${f.value}\n来源：${a.name}，第${f.page}页，${a.versionLabel||'版次未标注'}；资料更新：${a.updatedAt||'未返回'}。`);
 const missing=requested.filter(w=>!covered.has(w));
 if(missing.length)lines.push('本次证据未明确覆盖：'+missing.join('、')+'。');
 if(hidden)lines.push('未通过来源校验的证据已隐藏。');
 if(chosen.some(({a})=>a.document?.status==='partial'))lines.push('资料仅部分解析，仍有缺口。');
 lines.push('以上为内部机器提取，尚未人工核验。'+(data.has_more||matches.length>chosen.length?'还有未展示的候选证据。':''));
 return lines.join('\n');
}
export function videoSourceQuestion(question){
 return /(?:时间码|画面文字|转写时间)|(?:视频|宣传片)[\s？?。！!]*$/u.test(question)&&!/^(?:请)?(?:帮我)?(?:生成|制作|设计|编写|剪辑)/u.test(question);
}
function materialExcerpt(value){
 const line=String(value||'').replace(/\s+/gu,' ').trim();
 if(!line||/```|^[[{]|["'][\w .-]{1,60}["']\s*:|^(?:function\s|const\s+\w+\s*=|<\w+\b)/u.test(line))return '';
 return line.length>180?line.slice(0,177)+'…':line;
}
function videoTime(seconds){
 const total=Math.floor(seconds);
 return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');
}
function conciseVideoSources(assets){
 const evidence=assets.filter(a=>['ready','partial'].includes(a.video?.status)).flatMap(a=>{
  const segment=(a.video.segments||[]).find(s=>['screen_text','speech'].includes(s.kind)&&Number.isFinite(s.start)&&s.start>=0&&materialExcerpt(s.text));
  if(!segment)return [];
  const start=videoTime(segment.start);
  const end=Number.isFinite(segment.end)&&segment.end>=segment.start?videoTime(segment.end):start;
  return [a.name+' ['+start+(end===start?'':'–'+end)+' '+(segment.kind==='speech'?'语音转写':'画面文字')+'] '+materialExcerpt(segment.text)];
 }).slice(0,3);
 return evidence.length?evidence.join('\n'):'这次没查到可引用的视频时间码。你可以提供视频名称或画面里的关键词。';
}
export function conciseMaterialAnswer(data,question){
 const parameterAnswer=productParameterAnswer(data,question);if(parameterAnswer)return parameterAnswer;
 const training=trainingAnswer(data,question);if(training)return training;
 const direct=directMaterialParameterAnswer(data,question);if(direct)return direct;
 if(/知识覆盖|解析进度|学了多少|了解多少/.test(question))return coverageSummary(data.document_coverage)+'内部资料仅在公司系统内处理。你可以按型号查询参数、安装要求或资料出处。';
 if(videoSourceQuestion(question))return conciseVideoSources(data.assets);
 if(!data.assets.length&&data.relevance_filtered)return '本次检索没有找到同时满足你所提条件的资料。未将其他门类、未标注英文或非手册文件充当结果。'+(data.has_more?'本页候选未匹配，仍有后续候选，可说“下一页”继续核对。':'这不代表公司一定没有该资料；可能缺少语言标注或尚未入库。');
 if(!data.assets.length)return '在本次有权检索的资料中没有找到匹配内容，不能据此判断该产品不存在。请提供完整型号，或减少关键词后重试。\n'+coverageSummary(data.document_coverage);
 if(visualQuestion(question))return data.assets.slice(0,3).map(a=>`${a.name}｜${a.versionLabel||'版本未标注'}｜${a.isCurrentVersion?'当前版本':'历史版本'}\n更新时间：${a.updatedAt||'未标注'}；本次读取：${data.read_at||'未标注'}\n`+(a.document?.visual_understanding?slideVisualText(a.document.visual_understanding):'尚未取得本文件的图片/图表阅读证据，不能据此猜测图示含义或产品参数。')).join('\n\n');
 const wanted=fields(question),blocks=[],namedTargets=namedMaterialProducts(question),codeTargets=materialModelCodes(question);
 const targetMatches=f=>namedTargets.length===1?f.product.toLowerCase()===namedTargets[0].toLowerCase():codeTargets.length===1?f.product.toUpperCase()===codeTargets[0]:true;
 for(const a of data.assets.slice(0,3)){
  const refs=[],covered=new Set(),requested=wanted.filter(x=>!['来源','页码','版本'].includes(x));
  for(const f of a.document?.product_understanding?.findings||[]){
   if(targetMatches(f)&&(!requested.length||requested.some(w=>f.field===w||fields(f.field).includes(w)))){refs.push(`[第${f.page}页｜${f.field}，机器解释未人工核验] ${f.value}\n原文依据：${f.quote}`);for(const w of requested)if(f.field===w||fields(f.field).includes(w))covered.add(w)};
   if(refs.length>=3)break;
  }
  const profile=(a.document?.knowledge_profile?.summary||[]).find(r=>materialExcerpt(r.quote));if(!refs.length&&!requested.length&&profile)refs.push('['+(profile.location||'第'+profile.page+'页')+'] '+materialExcerpt(profile.quote));if(a.video){for(const segment of (a.video.segments||[]).slice(0,2))refs.push(`[${Math.floor(segment.start/60)}:${String(Math.floor(segment.start%60)).padStart(2,'0')} ${segment.kind==='speech'?'语音转写':segment.kind==='screen_text'?'画面文字':'画面推测'}] ${segment.text.slice(0,420)}`);if(!refs.length)refs.push('视频尚无可引用片段；状态：'+({queued:'排队中',processing:'处理中',failed:'失败',partial:'部分解析',ready:'采样完成'}[a.video.status]||'未解析'))}for(const p of a.document?.pages||[]){
   for(const f of p.facts||[])if(refs.length<3&&(!wanted.length||wanted.some(w=>f.quote.includes(w)||f.field===w))&&(namedTargets.length!==1||f.quote.toLowerCase().includes(namedTargets[0].toLowerCase()))&&p.chunks.join('\n').includes(f.quote)){refs.push(`[${p.location}] ${f.quote}`);for(const w of requested)if(f.field===w||f.quote.includes(w))covered.add(w)}
   if(!refs.length&&!requested.length){const excerpt=p.chunks.map(materialExcerpt).find(Boolean);if(excerpt)refs.push(`[${p.location}] ${excerpt}`);}
   if(refs.length>=3)break;
  }
  const missing=requested.filter(w=>!covered.has(w));
  blocks.push(`${blocks.length+1}. ${a.name}｜${a.versionLabel||'版本未标注'}｜${a.isCurrentVersion?'当前版本':'历史版本'}\n更新时间：${a.updatedAt||'未标注'}；本次读取：${data.read_at||'未标注'}\n`+(refs.length?refs.slice(0,3).join('\n'):requested.length?'本次返回证据未明确覆盖所问参数，不能据此补充数值或条件。':materialExcerpt(a.excerpt)?'现有索引摘录：'+materialExcerpt(a.excerpt):'暂无可用于回答的正文证据。')+(refs.length&&missing.length?'\n本次证据未明确覆盖：'+missing.join('、')+'；保留缺口，不补充推断。':'')+(a.document?.status==='partial'?'\n此资料仅部分解析，仍有缺口。':''));
 }
 const specific=wanted.some(x=>!['来源','页码','版本'].includes(x));
 const differences=evidenceDifferences(data.assets),ledgerData=specific?productLedger(data):null;
 const hidden=ledgerData?.hidden_findings?'另有 '+ledgerData.hidden_findings+' 条摘录缺少原页，已隐藏。\n':'';
 const ledger=specific&&ledgerData?.products.length?'产品理解状态（内部机器提取，均未人工核验，不是完整产品理解）\n'+ledgerData.products.slice(0,5).map(p=>`${p.name}：${p.states.coverage}；${p.states.extraction}`).join('\n'):'';
 return `已找到本页 ${data.assets.length} 项相关资料，先列出 ${blocks.length} 项证据。以下是原文摘录，不是已核验的产品结论。\n\n`+(ledger?ledger+'\n':'')+hidden+blocks.join('\n\n')+(differences?'\n\n'+differences:'')+'\n\n可继续问某型号的具体参数，或说“展开”查看本页详细证据。'+(data.has_more?'说“下一页”继续相同关键词。':'');
}
