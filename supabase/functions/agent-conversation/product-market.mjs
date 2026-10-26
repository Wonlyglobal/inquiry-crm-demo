// Company-only analysis. Internal product excerpts never enter a model prompt or speech payload.
import publicFile from './product-market-evidence.json' with {type:'json'};
import {COUNTRY_CODES} from './country-codes.mjs';
import {findModels} from './catalog-knowledge.mjs';
import {materialModelCodes,materialVersion,normalizeProductInput} from './product-input.mjs';
import {searchCatalogue,catalogueSearchCoverage} from './catalog-search.mjs';
import {mentions} from './product-materials.mjs';
import {privateV9Turn} from './private-v9-turn.mjs';
import {PUBLIC_EVIDENCE,DIMENSIONS} from './public-research.mjs';
import {analyticalMarketFact,negativeMarketFact,marketDecision,renderMarketDecision} from './market-conclusion.mjs';

const norm=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s_/-]+/g,'');
const CAT=[['smart_lock','智能锁',/智能锁|指纹锁|smart locks?/i],['wooden_door','木门',/木门|wooden doors?/i],['security_door','防盗门',/防盗门|security doors?/i],['smart_door','智能门',/智能门/],['hospital_door','医院门',/医院门|医疗门|hospital doors?/i],['school_door','学校门',/学校门/],['refuge_door','避难门',/避难门/],['fire_window','防火窗',/防火窗/],['lock_body','锁体',/锁体/],['lock_core','锁芯',/锁芯/],['hinge','合页',/合页|铰链/],['door_viewer','猫眼',/猫眼/]];
const CATALOG={c1:'工程画册',c2:'零售画册',c3:'静音木门画册',c4:'真智能锁画册'};
const editionKey=s=>norm(s).replace(/第([一二三四五六七八九十\d]+)版/g,(_,n)=>'V'+({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[n]||n));
const catOf=q=>CAT.find(([, ,re])=>re.test(q))?.[0]||null;
export const productMarketIntent=q=>/SWOT|国家匹配|市场匹配|市场竞争|竞争(?:强度|程度|度)|市场(?:分析|定位|机会|结论)|各国|每个国家|五力|market (?:analysis|fit)|country fit/i.test(String(q));
// The owner-selected smart-lock master is V9; never silently answer from the fixed August index.
export function marketProductScope(question,catalog){
 const q=String(question),models=findModels(q,catalog);
 const smart=catOf(q)==='smart_lock'||models.some(m=>(catalog?.products||[]).some(p=>norm(p.model)===norm(m)&&p.category==='smart_lock'));
 return smart&&!materialVersion(q)?q+' 智能锁画册v9':q;
}
export function marketMaterialQuestion(question,model){
 const edition=materialVersion(question);
 if(editionKey(edition)==='V9')return privateV9Turn('智能锁画册v9 '+model+'参数与来源页码')?.question||'物料：'+model+' 智能锁画册v9';
 return '物料：'+model+' '+edition;
}
const PREFIX='产品市场：';
export function productMarketTurn(question,history=[]){
 const q=normalizeProductInput(question).replace(/^产品市场：/,'').trim();
 const previous=history.find(h=>String(h).startsWith(PREFIX));
 const follow=previous&&/^(?:那|那么|换成|改为|再看|继续|来源|证据|缺口|为什么|哪些|建议|评分|匹配|竞争|下一页|产品第|国家第)/.test(q)&&
  (productMarketIntent(q)||countryMatches(q).length||materialModelCodes(q).length||catOf(q)||/来源|证据|缺口|为什么|建议|评分|匹配|竞争|下一页|产品第|国家第|优势|劣势|机会|威胁|定位|参数|安装|认证|售后/.test(q));
 if(!productMarketIntent(q)&&!follow)return null;
 if(!previous||!follow)return q;
 const prior=previous.slice(PREFIX.length),models=materialModelCodes(q),category=catOf(q),countries=countryMatches(q);
 let base=prior.replace(/(?:产品|国家)第\s*\d+\s*页/g,'');
 if(models.length||category)for(const m of materialModelCodes(prior))base=base.replace(new RegExp('(?<![A-Za-z0-9])'+escape(m)+'(?![A-Za-z0-9])','gi'),'');
 if(category)for(const [, ,re] of CAT)base=base.replace(re,'');
 if(countries.length){
  base=base.replace(/(?:CRM|询盘|线索).{0,12}(?:重点|优先|主要|排名).{0,5}(?:国家|市场)|(?:重点|优先|主要)国家.{0,12}(?:CRM|询盘|线索)/gi,'');
  for(const c of countryMatches(base))for(const name of [...c.aliases,c.code])base=base.replace(new RegExp(/\p{Script=Han}/u.test(name)?escape(name):'(?<![A-Za-z])'+escape(name)+'(?![A-Za-z])','gi'),'');
  base=base.replace(/每个国家|所有国家|全部国家|各国|全球国家|all countries/gi,'');
 }
 const next=/下一页/.test(q)?((/每个国家|所有国家|全部国家|各国|全球国家|all countries/i.test(prior)?'国家':'产品')+'第'+(Number(prior.match(/(?:产品|国家)第\s*(\d+)\s*页/)?.[1]||1)+1)+'页'):q;
 return (base+'；'+next).slice(0,480);
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const zh=new Intl.DisplayNames(['zh-CN'],{type:'region'}),en=new Intl.DisplayNames(['en'],{type:'region'});
const ALIASES={GB:['英国','United Kingdom','Great Britain','UK'],US:['美国','USA','United States'],AE:['阿联酋','迪拜','UAE'],SA:['沙特','Saudi Arabia'],SG:['新加坡','Singapore'],KR:['韩国','South Korea'],RU:['俄罗斯','Russia'],VN:['越南','Vietnam']};
const COUNTRIES=COUNTRY_CODES.map(code=>({code,label:zh.of(code),aliases:[...new Set([zh.of(code),en.of(code),...(ALIASES[code]||[])])]}));
export function countryMatches(question){
 const q=String(question||''),matches=[];
 for(const c of COUNTRIES){
  for(const m of q.matchAll(new RegExp('(?<![A-Za-z])'+c.code+'(?![A-Za-z])','g')))matches.push({code:c.code,start:m.index,end:m.index+m[0].length});
  for(const alias of c.aliases)for(const m of q.matchAll(new RegExp(/\p{Script=Han}/u.test(alias)?escape(alias):'(?<![A-Za-z])'+escape(alias)+'(?![A-Za-z])','gi')))matches.push({code:c.code,start:m.index,end:m.index+m[0].length});
 }
 const selected=[];for(const m of matches.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start))if(!selected.some(s=>m.start<s.end&&m.end>s.start))selected.push(m);
 const codes=new Set(selected.map(m=>m.code));return COUNTRIES.filter(c=>codes.has(c.code));
}
export function validMarketEvidence(file=publicFile){
 if(file?.schema!=='product-market-public-v1')return [];
 const ids=new Set();return (file.entries||[]).filter(e=>{
  let url;try{url=new URL(e.url)}catch{return false}
  if(ids.has(e.id)||typeof e.id!=='string'||!COUNTRY_CODES.includes(e.country)||!CAT.some(([c])=>c===e.category)||!['case','admission','demand','price','channel'].includes(e.kind)||e.read_status!=='body_verified'||!/^\d{4}-\d{2}-\d{2}$/.test(e.checked_at||'')||!Number.isFinite(Date.parse(e.checked_at))||url.protocol!=='https:'||url.username||url.password)return false;
  if(!['fact','condition','implication','title'].every(k=>typeof e[k]==='string'&&e[k].length>0&&e[k].length<1500))return false;
  ids.add(e.id);return true;
 });
}
export function allMarketEvidence(){
 // Search all previously authorized public records too. Their old access/verification status
 // is not promoted to today's check or current competition evidence.
 return [...validMarketEvidence(),...PUBLIC_EVIDENCE.map(e=>({id:'existing-'+e.id,country:e.market,category:e.category==='medical_door'?'hospital_door':e.category,kind:'case',title:e.company+' · '+e.product,url:e.source_url,published_at:null,checked_at:e.accessed,read_status:'existing_index_not_rechecked',fact:(DIMENSIONS[e.dimension]?.label||e.dimension)+'：'+e.value,condition:'既有公开证据库的候选对标记录；本轮未重开原网页，不证明同档直接竞争或当前销售/认证范围。',implication:'仅作官方原文回查线索；复核当地配置、日期和同口径价格/服务后再比较，不以此记录直接判断优劣、需求或竞争强度。'}))];
}
const fresh=(e,now)=>{const age=now-Date.parse(e.checked_at);return e.read_status==='body_verified'&&age>=-86400000&&age<=(e.kind==='admission'?180:90)*86400000};
export function modelMarketEvidence(model,catalog,materials,{edition=''}={}){
 const ids=new Set((catalog?.sources||[]).map(s=>s.id));
 const old=(catalog?.products||[]).filter(p=>norm(p.model)===norm(model)&&ids.has(p.catalog)&&Number.isInteger(p.page)&&p.page>0);
 const facts=[],incomplete=new Set();
 for(const a of materials?.assets||[]){
  // The original parsed source hash and explicit model association are mandatory.
  if(a.isCurrentVersion!==true||!/^[a-f0-9]{64}$/.test(a.document?.sha256||''))continue;
  if(edition&&editionKey(materialVersion(a.versionLabel+' '+a.name))!==editionKey(edition))continue;
  for(const f of a.document.incomplete_fields||[])if(norm(f.model)===norm(model))incomplete.add(norm(f.field));
  for(const f of a.document.product_understanding?.findings||[]){
   if(norm(f.model||f.product)!==norm(model)||!Number.isInteger(f.page)||f.page<1)continue;
   facts.push({field:f.field,value:f.value,ref:`${a.name} 第${f.page}页`,edition:a.versionLabel||'版次未标注',date:a.updatedAt||null,sha256:a.document.sha256,current:true,source_page:f.page,source_quote:f.quote,source_kind:'semantic'});
  }
  for(const p of a.document.pages||[])for(const f of p.facts||[]){
   if(!Number.isInteger(p.page)||p.page<1||!mentions({excerpt:f.quote},model)||!(p.chunks||[]).some(c=>c.includes(f.quote)))continue;
   facts.push({field:f.field,value:f.quote,ref:`${a.name} 第${p.page}页`,edition:a.versionLabel||'版次未标注',date:a.updatedAt||null,sha256:a.document.sha256,current:true,source_page:p.page,source_quote:f.quote,source_kind:'native'});
  }
 }
 // A native quote and its machine interpretation share one source. Their different
 // representations are not conflicting values. Distinct interpretations/quotes still conflict.
 const sourceKey=f=>JSON.stringify([f.sha256,editionKey(f.edition),f.source_page,norm(f.field),f.source_quote]);
 const semanticSources=new Set(facts.filter(f=>f.source_kind==='semantic').map(sourceKey)),seen=new Set();
 const unique=facts.filter(f=>{
  const source=sourceKey(f);if(f.source_kind==='native'&&semanticSources.has(source))return false;
  const key=JSON.stringify([source,f.source_kind,norm(f.value)]);if(seen.has(key))return false;seen.add(key);return true;
 });
 const conflicts=[];const values=new Map();
 for(const f of unique){const key=norm(f.field);if(!values.has(key))values.set(key,new Set());values.get(key).add(norm(f.value))}
 for(const [key,v] of values)if(v.size>1)conflicts.push(key);
 const current=unique.filter(f=>!conflicts.includes(norm(f.field))&&!incomplete.has(norm(f.field))).map(({source_page,source_quote,source_kind,...f})=>f);
 // Fixed August records are supplemental only. An explicitly requested edition never falls back.
 const supplemental=edition?[]:old.flatMap(p=>Object.entries(p.specs||{}).filter(([,v])=>typeof v==='string'&&v.trim()).map(([field,value])=>({field,value,ref:`${CATALOG[p.catalog]||p.catalog} PDF第${p.page}页`,edition:'2026年8月版；未核定为现行配置',date:'2026-08',current:false})));
 return {model,category:old[0]?.category||null,facts:current,supplemental,conflicts,incomplete_fields:[...incomplete],duplicate_evidence_count:facts.length-unique.length,source_status:materials?.status||'unavailable',human_verified:false};
}
const textFacts=rows=>rows.map(f=>`${f.field}：${f.value}`).join('；');
// Identity is a source locator. A model/name alone cannot establish a feature, strength or fit.
const analyticalFact=analyticalMarketFact;
const dimensionGroups=[['需求与使用场景','实际购买需求、细分客户和替代方案'],['产品与安装适配','锁体尺寸、门厚、开向、环境与联网条件'],['准入与认证','具体型号/配置/门组合的当地准入范围'],['价格与渠道','同档含税落地价、安装费、渠道毛利与获客成本'],['交付与售后','当地安装、备件、保修及服务能力']];
export function countryAssessment(product,country,evidence=allMarketEvidence(),now=Date.now()){
 const category=product.category;
 const rows=evidence.filter(e=>e.country===country.code&&e.category===category);
 const usable=rows.filter(e=>fresh(e,now)),cases=usable.filter(e=>e.kind==='case'),supply=usable.filter(e=>['case','price','channel'].includes(e.kind)),admission=usable.filter(e=>e.kind==='admission');
 const current=product.facts.some(analyticalFact)&&!product.conflicts.length;
 return {country,rows,usable,cases,supply,admission,score:null,competition_score:null,
  fit:!current?'产品现行证据待补，暂不能定级':'仅支持资料与台架方案核对，准入/安装/商业适配尚未证实；暂不能定级',
  competition:supply.length?'存在可核对竞品供给；强度待核验':'尚缺当地同类竞品证据；强度未知',
  dimensions:dimensionGroups.map(([label,needed],i)=>({label,status:i===1&&current?'已有本型号机器摘录，尚未验证当地适配':i===2&&admission.length?'已取得规则，未取得该型号合规证明':i===3&&usable.some(e=>['case','price','channel'].includes(e.kind))?'有当地供给/报价或渠道样本，缺同配置完整成本和交付核对':'待补证据',needed:i===1&&category!=='smart_lock'?'结构、安装接口与尺寸、使用环境及配置':needed})),
  forces:[['现有竞争',supply.length?'已有同国同类供应样本，缺价格带/份额/渠道覆盖，不能判高低':'缺同国同类供应样本'],['替代品','缺机械锁/其他方案的同场景比较'],['潜在进入者','缺进入成本与渠道壁垒证据'],['买方议价','缺客户集中度、转换成本及采购方式'],['供应商议价','缺关键零部件可替代性与采购集中度']]};
}
function renderCountry(a,now){
 return `${a.country.label}（${a.country.code}）\n国家匹配度：${a.fit}；未评分。\n市场竞争度：${a.competition}；未评分。\n`+a.dimensions.map(d=>`- ${d.label}：${d.status}；需核对${d.needed}。`).join('\n')+
  `\n当地证据与案例：匹配${a.rows.length}条，本次最多展示6条；先列本轮已核验样本。\n`+(a.rows.length?a.rows.slice(0,6).map(e=>`[${e.id}] ${e.title}：${e.fact}\n适用条件：${e.condition}\n${fresh(e,now)?'':'历史证据，需复核；'}来源：${e.url}\n发布：${e.published_at||'未标注'}；更新：${e.updated_at||'未标注'}；${e.read_status==='body_verified'?'实际核验':'原库访问日期（本轮未重验）'}：${e.checked_at}。\n分析建议（推断，非市场效果）：${e.implication}`).join('\n'):'本次未取得这一国家与门类的可引用证据，不挪用其他国家的法规或案例。')+
  '\n五力核对：'+a.forces.map(([label,value])=>`${label}：${value}`).join('；')+'。'+(a.decision?'\n\n'+renderMarketDecision(a.decision):'')+
  (publicFile.research_gaps?.[a.country.code]?.length?'\n\n本轮公开研究缺口（实际核验2026-10-26）：\n'+publicFile.research_gaps[a.country.code].map(g=>'- '+g).join('\n'):'');
}
export function productMarketReport({question,catalog,materials={status:'unavailable',assets:[]},evidence=allMarketEvidence(),now=Date.now(),countryScope=null}){
 const q=String(question),explicit=materialModelCodes(q),known=findModels(q,catalog),edition=materialVersion(q),cat=catOf(q);
 const unique=[...new Set((catalog?.products||[]).filter(p=>!cat||p.category===cat).map(p=>p.model).filter(Boolean))];
 const models=explicit.length?explicit.map(m=>known.find(k=>norm(k)===norm(m))||m):known;
 const selectedCountries=Array.isArray(countryScope)?countryScope.map(code=>COUNTRIES.find(c=>c.code===code)).filter(Boolean):countryMatches(q),all=!Array.isArray(countryScope)&&/每个国家|所有国家|全部国家|各国|全球国家|all countries/i.test(q);
 const countryPage=Math.max(1,Math.min(30,Number(q.match(/国家第\s*(\d+)\s*页/)?.[1]||1)));
 const countries=all?COUNTRIES.slice((countryPage-1)*12,countryPage*12):selectedCountries;
 const coverage=catalog?catalogueSearchCoverage(searchCatalogue(models.join(' ')||cat||q,catalog,{models})): '私有画册索引本次不可用，未完成检索；不改用外部模型补内部产品事实。';
 const heading='产品市场分析｜内部证据版\n分析日期：'+new Date(now).toISOString().slice(0,10)+'；结论按型号、国家、场景和版本分别成立，资料未知不填0，不把搜索结果数当市场份额。\n';
 if(!models.length){
  const page=Math.max(1,Math.min(100,Number(q.match(/产品第\s*(\d+)\s*页/)?.[1]||1))),items=unique.slice((page-1)*8,page*8);
  return {answer:heading+`本次目录找到${unique.length}个${CAT.find(([c])=>c===cat)?.[1]||'产品'}型号；这是已索引目录，不是全部现售SKU。产品第${page}页，本页${items.length}个：\n`+items.map(m=>`${m}：可逐款查询产品证据、SWOT与国家匹配；尚未生成或核验该款市场结论。`).join('\n')+`\n请指定一个完整型号和国家，例如“分析${items[0]||'完整型号'}在新加坡的市场，给出SWOT和国家匹配度”。${unique.length>page*8?'可问“产品第'+(page+1)+'页”。':''}\n`+coverage,models:[],countries:[],status:'needs_model',material_question:PREFIX+q.slice(0,475)};
 }
 if(models.length>1)return {answer:heading+'一次先核验一个完整型号，避免把不同配置混成一份SWOT。当前识别：'+models.join('、')+'。请选其中一款；其他型号的证据未被合并。',models,countries:[],status:'needs_model',material_question:PREFIX+q.slice(0,475)};
 const product=modelMarketEvidence(models[0],catalog,materials,{edition});if(!product.category)product.category=cat;
 const current=product.facts,parameters=current.filter(analyticalFact),old=product.supplemental;
 const sourceLine=f=>`${f.field}：${f.value}｜${f.ref}｜${f.edition}｜来源日期：${f.date||'未标注'}${f.sha256?'｜SHA-256 '+f.sha256:''}`;
 const hasProduct=current.length||old.length;
 const productText=`型号：${product.model}；门类：${CAT.find(([c])=>c===product.category)?.[1]||'未核定'}；指定资料版本：${edition||'未指定，现行资料优先'}\n现行产品证据（机器提取，未人工核验）：\n`+(current.length?current.slice(0,8).map(sourceLine).join('\n'):'本次未取得明确属于此型号的现行参数摘录。')+(old.length?'\n历史补充资料（不覆盖V9/其他指定版本，不用于现行合规结论）：\n'+old.slice(0,6).map(sourceLine).join('\n'):'')+`\n物料查询状态：${product.source_status}；现行同字段冲突${product.conflicts.length}项，展示预算未完整覆盖${product.incomplete_fields.length}个字段（均不参与判断）。`;
 const positive=parameters.filter(f=>!negativeMarketFact(f));
 const featureText=textFacts(positive),unlock=/开锁|unlock|finger|指纹|密码|人脸/i.test(featureText),remote=/remote|远程|联网|wi.?fi|bluetooth|蓝牙/i.test(featureText);
 const positioning=hasProduct?(product.category==='smart_lock'?(unlock?'无钥匙进入便利可作为场景假设，需验证实际使用人群、识别体验及应急开锁。':'先明确用户进入/离开场景，不能以型号名称推断开锁配置。')+(remote?'资料出现联网/远程相关表述；需核对具体配置、安全支持和权限管理。':'本次未取得足以确认联网能力的证据，不能承诺远程管理。'):'先用该型号已有结构/性能证据验证具体场景，不把其他型号或门类的案例当本型号业绩。'):'产品证据不足，先补身份、配置及适用条件，不输出产品优势。';
 const assessments=countries.map(c=>{const a=countryAssessment(product,c,evidence,now);return {...a,decision:marketDecision(product,a)}});
 const swot='SWOT（事实、推断与缺口分开）\nS 潜在优势：'+(positive.length?positive.slice(0,2).map(f=>`${f.field}“${f.value}”（${f.ref}）可作为待测试卖点；相对优势尚需同档竞品验证`).join('；'):'尚无现行证据支持优势判断；旧画册仅可提供核对线索')+'。\nW 已确认劣势：本次没有足够可比证据判定；参数、价格或渠道未知单列缺口，不把未知当实际劣势。\nO 机会假设：'+(assessments.some(a=>a.cases.length)?'可借当地已观察到的供给/交付机制设计差异化测试，不能据此断言需求规模或增长。':'缺当地需求与案例验证，暂不判定市场机会。')+'\nT 外部威胁/约束：'+(assessments.flatMap(a=>a.admission).map(e=>`[${e.id}] ${e.fact}`).join('；')||'当地准入、替代方案和同档竞争资料待补，不能断言竞争少或准入容易。');
 const decision=parameters.length?'先作为市场验证候选，暂不批准商业投放或全国排名；优先解决准入、安装适配与服务交付，再验证客户愿付价格。':'暂缓给出现行产品市场适配结论：尚缺同型号功能/参数/适用条件证据；型号或名称仅能确认身份，不能作为产品优势，也不能用旧版资料判定适合出口。';
 const action='下一步与验收指标（建议，未执行）\n1. 产品/准入：核对同型号原页、配置、门组合及适用认证；记录符合、冲突、未取得，准入未知不算通过。\n2. 渠道/价格：选目标国家一个细分场景，取得同档含税落地价、安装/备件/服务承诺和需求访谈；记录完整交付成本与适配失败原因。\n3. 小范围验证：先验证样锁安装与使用任务，再验证定位文案；看安装一次通过、关键任务完成、合格询盘与售后问题。未建立基线不编增长率、ROI或销量目标。';
 const methods='方法依据：\n'+publicFile.methods.map(m=>`${m.name}：${m.use}\n${m.url}（核验${m.checked_at}）`).join('\n');
 return {answer:heading+`阶段结论：${decision}\n\n`+productText+'\n\nSTP定位与4P核对：'+positioning+'价格、渠道与推广主张分别验证，产品功能不等于当地购买需求。\n\n'+swot+'\n\n'+(assessments.length?assessments.map(a=>renderCountry(a,now)).join('\n\n'):'请补充具体国家；不把地区或默认国家套用到全部国家。当前有新加坡和英国智能锁官方证据样本，其他国家同样可查询并保留缺口。')+(all?`\n国家目录覆盖${COUNTRIES.length}个ISO国家/地区，本页${countries.length}个，国家第${countryPage}页；目录存在不等于已研究。${COUNTRIES.length>countryPage*12?'可问“国家第'+(countryPage+1)+'页”。':''}`:'')+'\n\n评分口径：国家匹配按需求、产品适配、准入、价格渠道、交付售后五维核对；竞争度按五力独立核对。当前缺少可审计的同口径需求、成本及竞争基线，暂不生成0—100分或国家排序，也不把证据覆盖率冒充匹配分。\n\n'+action+'\n\n'+coverage+`\n公开市场检索覆盖：本次检查全部${evidence.length}条已收录官方样本/既有竞品记录后按国家与门类筛选；旧访问记录不冒充今日核验，不代表全球市场普查。`+'\n当前版本标记来自物料接口，SHA-256标识本次解析来源；本次未重新计算原件哈希。物料接口有返回/分页/解析限额，未命中不等于没有；未按相似标题绑定项目、未将公司案例当本型号销量。\n\n'+methods+'\n内部资料与本报告仅在公司系统内处理，未发送外部模型；本次不改客户、发帖或投放。',models,countries:countries.map(c=>c.code),status:parameters.length?'preliminary':'product_evidence_gap',product,current_source_count:current.length,current_parameter_count:parameters.length,assessments,material_question:PREFIX+q.slice(0,475)};
}
