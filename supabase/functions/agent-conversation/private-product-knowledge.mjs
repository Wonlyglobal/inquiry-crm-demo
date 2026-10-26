// Original-owner RPC only. Native private excerpts never enter a provider or speech prompt.
import {materialModelCodes,materialVersion,normalizeProductInput} from './product-input.mjs';
import {nativeProductEvidence} from './product-native-evidence.mjs';

const canonical=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s_/.-]+/g,'');
const editionKey=s=>canonical(materialVersion(s)||s).replace(/^第([一二三四五六七八九十\d]+)版$/,(_,n)=>'V'+({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[n]||n));
const prefix='私有产品：';
const parameter=/参数|功能|开锁|解锁|门厚|安装|供电|电池|尺寸|材质|配置|说明|来源|证据|缺口|哪些|如何|多少|支持|介绍|features?|specs?|thickness|battery|unlock|installation|source/i;
const gapLabels={source_edition_unknown:'原文版次未确认。',source_publication_date_unknown:'原文发布日期未返回。',source_update_date_unknown:'原物料更新时间未返回。',extraction_date_unknown:'提取日期未确认。',recorded_source_gaps:'原件解析保留以下未覆盖项，不能据此宣称完整理解。',signed_source_page_unmatched:'本次授权源未返回同哈希、版次及页码，暂未完成现行同源验证。',source_current_unconfirmed:'来源未确认现行，仅保留候选摘录。',no_accepted_native_regions:'没有通过完整型号及区域归属校验的原生摘录。'};
export const nativeGapText=g=>gapLabels[g]||(/^[a-z_]+$/.test(g)?'原生区域结构或归属仍有校验缺口，相关字段未用于结论。':g);

export function nativeProductTurn(question,history=[]){
 const q=normalizeProductInput(question).trim();
 const models=materialModelCodes(q);
 const prior=history.find(h=>String(h).startsWith(prefix));
 if(models.length===1&&(parameter.test(q)||prior&&q.length<=100&&/^(?:换成|改为|再看|那)/.test(q))){
  const edition=materialVersion(q)||(prior&&/^(?:换成|改为|再看|那)/.test(q)?materialVersion(prior):'')||'';
  return {model:models[0],edition,question:models[0]+(edition?' '+edition:'')+'；'+q};
 }
 if(!prior||models.length||q.length>100||!parameter.test(q)||! /^(?:那|它|这款|这个|还有|再|来源|证据|缺口|门厚|安装|供电|电池|尺寸|材质|功能|开锁|解锁|what|and|how)/i.test(q))return null;
 const priorQ=prior.slice(prefix.length),previous=materialModelCodes(priorQ);
 if(previous.length!==1)return null;
 const edition=materialVersion(q)||materialVersion(priorQ)||'';
 return {model:previous[0],edition,question:(previous[0]+(edition?' '+edition:'')+'；'+q).slice(0,475)};
}

export function nativeSources(materials){
 return (materials?.assets||[]).map(a=>({asset_id:a.id,sha256:a.document?.sha256,edition:a.versionLabel||'',is_current_version:a.isCurrentVersion===true,signed_source:true,pages:(a.document?.pages||[]).map(p=>p.page),updated_at:a.updatedAt||null,published_at:null}));
}

export async function loadPrivateProductEvidence(client,{model,edition='',materials}){
 let result;
 try{const r=await client.rpc('read_agent_private_intelligence',{p_kind:'product',p_from:null,p_to:null,p_key:null,p_limit:5});if(r.error)throw Error();result=r.data}catch{return {status:'unavailable',facts:[],receipts:[],gaps:['私有产品证据读取未完成；未将失败视为无参数。'],bounded:true}}
 const all=Array.isArray(result?.documents)?result.documents:[];
 const rows=all.filter(r=>canonical(r.document?.product_evidence?.model)===canonical(model)&&(!edition||editionKey(r.document?.product_evidence?.source_edition)===editionKey(edition)));
 const facts=[],receipts=[],blocked=[],gaps=[];
 for(const r of rows){
  if(!/^[0-9a-f]{64}$/.test(r.digest||'')||r.document?.kind!=='product')continue;
  const checked=nativeProductEvidence(r.document,{model,edition,sources:nativeSources(materials)});
  for(const f of checked.facts||[])facts.push({...f,knowledge_id:r.id,knowledge_digest:r.digest,knowledge_key:r.document.key});
  blocked.push(...(checked.blocked||[]));gaps.push(...(r.document.product_evidence.gaps||[]),...(checked.gaps||[]));
  receipts.push({id:r.id,digest:r.digest,key:r.document.key,imported_at:r.imported_at});
 }
 if(blocked.length)for(const f of facts)f.analysis_eligible=false;
 return {status:rows.length?'available':'not_found',facts,receipts,blocked,gaps:[...new Set(gaps)],bounded:true,read_count:all.length,has_unexamined:all.length===5};
}

export function nativeProductAnswer(result,turn){
 const fields=(result.facts||[]),sourceMatched=fields.filter(f=>f.analysis_eligible===true);
 const focus=String(turn.question||'').split('；').at(-1);
 const requested=[[/供电|电池|battery|power/i,/供电|电池|battery|power|mAh|充电/i],[/门厚|thickness/i,/门厚|door\s*thickness|thickness/i],[/防水|IP\d|防护等级/i,/防水|waterproof|IP\d/i],[/安装|锁体|背距|开孔|installation|mortise|backset/i,/安装|锁体|背距|开孔|install|mortise|backset/i]].filter(([q])=>q.test(focus));
 const out=['产品参数｜私有原生页证据',`完整型号：${turn.model}；指定版次：${turn.edition||'未指定'}。`,
 '下列为按原页产品分区提取的原生文字，未经人工产品核验；不表示已理解图片、尺寸箭头、图标、认证或实际现售配置。'];
 if(requested.some(([,quote])=>!fields.some(f=>quote.test(f.value))))out.push('当前追问所需的具体参数未在这些原生文字中返回；该项保持未知。下方保留同型号已有摘录和缺口，不能将其他功能当成该参数。');
 if(fields.length)for(const f of fields)out.push(`\n${f.field}：${f.value}\n来源：${f.ref}｜版次：${f.edition}\n原文发布日期：${f.published_at||'未知'}；物料更新时间：${f.date||'未返回'}\n原件SHA-256：${f.sha256}\n归属验证：${f.analysis_eligible===true?'与本次授权源的版次、哈希及页码一致；实际供货状态未核验':'未完成同源现行验证，仅作私有历史/候选摘录'}。`);
 else out.push('\n未取得可归属该完整型号的私有原生参数证据；不借用相邻型号或旧版参数。');
 out.push('\n缺口与适用边界：');
 for(const g of [...new Set((result.gaps||[]).map(nativeGapText))])out.push('- '+g);
 out.push('- 尚未返回或原文未载的参数保持未知，不按缺失推断为不支持；实际安装、供电、联网、环境及当地准入须分别核验。',
  '- 本次私有读取上限为最近5份产品证据，再按完整型号和版次筛选；这不是全库或全产品覆盖。');
 if(result.blocked?.length)out.push(`- ${result.blocked.length}项证据未通过归属/结构校验，未用于回答。`);
 if(result.has_unexamined)out.push('- 读取达到5份上限，仍可能存在未读产品证据。');
 out.push(`同源验证字段：${sourceMatched.length}项；不据此给出国家商业匹配评分。`);
 for(const r of result.receipts||[])out.push(`\n知识编号：${r.id}\n知识键：${r.key}\n知识包SHA-256：${r.digest}`);
 return {answer:out.join('\n'),material_question:prefix+turn.question,receipts:result.receipts||[],field_count:fields.length,source_matched_count:sourceMatched.length,status:result.status};
}
