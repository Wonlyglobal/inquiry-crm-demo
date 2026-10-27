// Original-owner RPC only. Native private excerpts never enter a provider or speech prompt.
import {materialModelCodes,materialVersion,normalizeProductInput} from './product-input.mjs';
import {nativeProductEvidence} from './product-native-evidence.mjs';

const canonical=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s_/.-]+/g,'');
const editionKey=s=>canonical(materialVersion(s)||s).replace(/^第([一二三四五六七八九十\d]+)版$/,(_,n)=>'V'+({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[n]||n));
const sourceEdition=s=>{const version=materialVersion(s||'');return version&&canonical(s)===canonical(version)?editionKey(version):''};
const SHA=/^[a-f0-9]{64}$/;
const MAX_PRIVATE_ROWS=5;
const prefix='私有产品：';
const parameter=/参数|功能|开锁|解锁|门厚|安装|供电|电池|尺寸|材质|配置|说明|来源|日期|版次|版本|证据|缺口|哪些|如何|多少|支持|介绍|features?|specs?|thickness|battery|unlock|installation|source|date|edition|version/i;
const gapLabels={source_edition_unknown:'原文版次未确认。',source_publication_date_unknown:'原文发布日期未返回。',source_update_date_unknown:'原物料更新时间未返回。',extraction_date_unknown:'提取日期未确认。',recorded_source_gaps:'原件解析保留以下未覆盖项，不能据此宣称完整理解。',signed_source_page_unmatched:'本次授权源未返回同哈希、版次及页码，暂未完成现行同源验证。',source_current_unconfirmed:'来源未确认现行，仅保留候选摘录。',no_accepted_native_regions:'没有通过完整型号及区域归属校验的原生摘录。',private_product_read_failed:'私有产品补读未完成；读取失败不表示没有参数。',private_product_response_invalid:'私有产品回读范围或结构未通过核对，未将该响应用于回答。',private_product_source_limit:'当前授权源知识键超过5个，本次仍有未读候选，全部摘录暂停正向分析。',private_product_source_edition_conflict:'同一授权源SHA对应多个版次标签，版次元数据冲突尚未解决。',private_product_no_current_source:'本次没有可定向的授权当前源，只保留最近5份中的私有候选，不用于正向分析。',private_product_candidate_limit:'候选读取达到5份上限，仍可能存在未读记录。',private_product_key_not_found:'本次当前授权源对应的精确产品知识键未命中已同步参数包；不表示原件没有参数。',private_product_scope_invalid:'完整型号范围无效，未读取私有产品记录。'};
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
 return (materials?.assets||[]).map(a=>({asset_id:a.id,sha256:a.document?.sha256,edition:a.versionLabel||'',edition_labels:[materialVersion(a.versionLabel||''),materialVersion(a.name||'')].filter(Boolean),is_current_version:a.isCurrentVersion===true,signed_source:true,pages:(a.document?.pages||[]).map(p=>p.page),updated_at:a.updatedAt||null,published_at:null}));
}

export async function nativeProductKey(sha,model){
 const code=canonical(model);
 if(!SHA.test(sha||'')||typeof model!=='string'||Array.from(model).length>60||!/^[A-Z][A-Z0-9]{2,59}$/.test(code)||!/[0-9]/.test(code)||/^(?:V|ISO|EN|UL)\d+$/.test(code))throw Error('Invalid product scope');
 const bytes=new TextEncoder().encode('grace-product-page-evidence-v1|'+sha+'|'+code);
 return 'product-'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}

export function nativeLookupText(result={}){
 if(result.lookup_mode==='source_keys')return `本次按完整型号及授权当前源SHA定向读取：已查${result.attempted_keys||0}/${result.source_key_count||0}个去重知识键；最多5个键、每键1份，合计原始返回最多5份。未追加最近记录回退；不代表全库覆盖。`;
 if(result.lookup_mode==='latest_candidates')return '本次没有可定向的授权当前源，仅候选读取最近5份产品记录后按完整型号和版次筛选；所有候选均不参与正向分析，不代表全库覆盖。';
 return '本次仅回读指定私有保存记录；未完成当前授权源验证，不代表全库或现行配置。';
}

export async function loadPrivateProductEvidence(client,{model,edition='',materials}){
 const facts=[],receipts=[],blocked=[],gaps=new Set(),sources=nativeSources(materials),plans=new Map(),editions=new Map();
 let rawRows=0,attempted=0,failed=false,incomplete=false,hasUnexamined=false,metadataConflict=false;
 const requested=edition?editionKey(edition):'';
 try{await nativeProductKey('0'.repeat(64),model)}catch{return {status:'unavailable',facts,receipts,blocked,gaps:['private_product_scope_invalid'],bounded:true,retrieval_incomplete:true,read_count:0,lookup_mode:'source_keys',source_key_count:0,attempted_keys:0}}
 for(const source of sources){
  if(source.is_current_version!==true||!SHA.test(source.sha256||''))continue;
  const versions=editions.get(source.sha256)||new Set();for(const label of source.edition_labels)versions.add(sourceEdition(label));editions.set(source.sha256,versions);
  const version=sourceEdition(source.edition);if(!version)continue;
  if(requested&&version!==requested)continue;
  const key=await nativeProductKey(source.sha256,model),plan=plans.get(key)||{key,sha256:source.sha256,editions:new Set()};
  plan.editions.add(version);plans.set(key,plan);
 }
 metadataConflict=[...editions.values()].some(versions=>versions.size>1);
 if(metadataConflict){incomplete=true;gaps.add('private_product_source_edition_conflict')}
 const mode=plans.size?'source_keys':'latest_candidates';
 if(plans.size>MAX_PRIVATE_ROWS){incomplete=true;hasUnexamined=true;gaps.add('private_product_source_limit')}
 if(mode==='latest_candidates')gaps.add('private_product_no_current_source');
 const selected=mode==='source_keys'?[...plans.values()].slice(0,MAX_PRIVATE_ROWS):[{key:null}];
 // Serial reads share the original 30/minute RPC budget. No retries and no second path.
 for(const plan of selected){
  const limit=mode==='source_keys'?1:MAX_PRIVATE_ROWS;attempted++;
  let rows;
  try{const r=await client.rpc('read_agent_private_intelligence',{p_kind:'product',p_from:null,p_to:null,p_key:plan.key,p_limit:limit});if(r.error||!Array.isArray(r.data?.documents))throw Error();rows=r.data.documents}
  catch{failed=true;incomplete=true;gaps.add('private_product_read_failed');break}
  const remaining=MAX_PRIVATE_ROWS-rawRows;
  // The existing SQL enforces p_limit; reject an inconsistent response before using it.
  rawRows+=Math.min(rows.length,remaining);
  if(rows.length>limit||rows.length>remaining){failed=true;incomplete=true;gaps.add('private_product_response_invalid');break}
  if(mode==='latest_candidates'&&rows.length===MAX_PRIVATE_ROWS){incomplete=true;hasUnexamined=true;gaps.add('private_product_candidate_limit')}
  for(const r of rows){
   const d=r?.document,e=d?.product_evidence;
   if(mode==='latest_candidates'&&(canonical(e?.model)!==canonical(model)||requested&&editionKey(e?.source_edition)!==requested))continue;
   const valid=SHA.test(r?.digest||'')&&d?.kind==='product'&&canonical(e?.model)===canonical(model)&&
    (mode!=='source_keys'||d.key===plan.key&&d.source_sha256===plan.sha256&&e?.source_sha256===plan.sha256&&plan.editions.has(sourceEdition(e?.source_edition)));
   if(!valid){failed=true;incomplete=true;gaps.add('private_product_response_invalid');continue}
   const checked=nativeProductEvidence(d,{model,edition,sources:mode==='source_keys'?sources:[]});
   for(const f of checked.facts||[])facts.push({...f,knowledge_id:r.id,knowledge_digest:r.digest,knowledge_key:d.key});
   blocked.push(...(checked.blocked||[]));for(const g of [...(Array.isArray(e.gaps)?e.gaps:[]),...(checked.gaps||[])])gaps.add(g);
   receipts.push({id:r.id,digest:r.digest,key:d.key,imported_at:r.imported_at});
  }
  if(failed)break;
 }
 if(mode==='source_keys'&&!receipts.length&&!incomplete)gaps.add('private_product_key_not_found');
 if(incomplete||blocked.length||mode==='latest_candidates')for(const f of facts)f.analysis_eligible=false;
 return {status:failed?(receipts.length?'partial':'unavailable'):incomplete?'partial':receipts.length?'available':'not_found',facts,receipts,blocked,gaps:[...gaps],bounded:true,read_count:rawRows,has_unexamined:hasUnexamined,retrieval_incomplete:incomplete,source_metadata_conflict:metadataConflict,lookup_mode:mode,source_key_count:plans.size,attempted_keys:mode==='source_keys'?attempted:0};
}

export function nativeProductAnswer(result,turn){
 const fields=(result.facts||[]),sourceMatched=fields.filter(f=>f.analysis_eligible===true);
 const focus=String(turn.question||'').split('；').at(-1);
 const requested=[['供电与电池',/供电|电池|battery|power/i,/供电|电池|battery|power|mAh|充电/i],['门厚',/门厚|thickness/i,/门厚|door\s*thickness|thickness/i],['防水与防护等级',/防水|IP\d|防护等级/i,/防水|waterproof|IP\d/i],['安装接口',/安装|锁体|背距|开孔|installation|mortise|backset/i,/安装|锁体|背距|开孔|install|mortise|backset/i],['最大承重',/承重|load.?bearing|maximum\s*(?:load|weight)/i,/承重|load.?bearing|maximum\s*(?:load|weight)/i],['容量与用户数量',/容量|用户数|capacity|users/i,/容量|用户|capacity|users/i],['材质',/材质|material/i,/材质|material|alloy|steel/i],['连接与联网',/联网|蓝牙|网关|远程|连接|wifi|bluetooth|gateway|connect/i,/联网|蓝牙|网关|远程|wifi|bluetooth|gateway|connect/i],['认证范围',/认证|证书|certif/i,/认证|证书|certif/i]].filter(([,q])=>q.test(focus));
 const out=['产品参数｜私有原生页证据',`完整型号：${turn.model}；指定版次：${turn.edition||'未指定'}。`,
 '下列为按原页产品分区提取的原生文字，未经人工产品核验；不表示已理解图片、尺寸箭头、图标、认证或实际现售配置。'];
 if(requested.length){out.push('逐项回应：');for(const [label,,quote] of requested)out.push(`${label}：${fields.some(f=>quote.test(f.value))?'下方同型号原文含相关线索；请按其具体数值、条件及范围核对，不把线索等同于参数或实测通过。':'本次摘录未返回可定位的原文参数，保持未知。'}`);}
 if(requested.some(([,,quote])=>!fields.some(f=>quote.test(f.value))))out.push('当前追问所需的具体参数未在这些原生文字中完整返回；上述未知项不使用其他功能替代。下方保留同型号已有摘录和缺口。');
 if(fields.length)for(const f of fields)out.push(`\n${f.field}：${f.value}\n来源：${f.ref}｜版次：${f.edition}\n原文发布日期：${f.published_at||'未知'}；物料更新时间：${f.date||'未返回'}\n原件SHA-256：${f.sha256}\n归属验证：${f.analysis_eligible===true?'与本次授权源的版次、哈希及页码一致；实际供货状态未核验':'未完成同源现行验证，仅作私有历史/候选摘录'}。`);
 else out.push(result.retrieval_incomplete||result.status==='unavailable'?'\n私有原生参数补读未完成，本次不能判断是否已保存该型号参数；不把读取失败或未读候选当作没有参数。':'\n本批未取得可归属该完整型号的私有原生参数证据；不借用相邻型号或旧版参数，未命中也不表示原件没有参数。');
 out.push('\n缺口与适用边界：');
 for(const g of [...new Set((result.gaps||[]).map(nativeGapText))])out.push('- '+g);
 out.push('- 尚未返回或原文未载的参数保持未知，不按缺失推断为不支持；实际安装、供电、联网、环境及当地准入须分别核验。',
  '- '+nativeLookupText(result));
 if(result.blocked?.length)out.push(`- ${result.blocked.length}项证据未通过归属/结构校验，未用于回答。`);
 if(result.has_unexamined)out.push('- 本次有界读取仍有未读候选，相关摘录不参与正向分析。');
 out.push(`同源验证字段：${sourceMatched.length}项；不据此给出国家商业匹配评分。`);
 for(const r of result.receipts||[])out.push(`\n知识编号：${r.id}\n知识键：${r.key}\n知识包SHA-256：${r.digest}`);
 return {answer:out.join('\n'),material_question:prefix+turn.question,receipts:result.receipts||[],field_count:fields.length,source_matched_count:sourceMatched.length,status:result.status};
}
