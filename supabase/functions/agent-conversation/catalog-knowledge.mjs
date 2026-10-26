import {normalizeProductInput,bareModel,materialVersion} from './product-input.mjs';
import {selectionIntent,selectionAnswer} from './product-selection.mjs';
import {inventoryIntent,inventoryAnswer} from './product-inventory.mjs';
import {projectQuestion,projectIntent,projectAnswer} from './catalog-projects.mjs';
import {searchCatalogue,catalogueSearchCoverage,catalogueSearchFallback} from './catalog-search.mjs';
// Deterministic answers from the private WONLY overseas catalogue knowledge (wonly-catalog-v1).
// Source: the four 2026-08 overseas catalogues, read by Claude under Chloe's 2026-09-28 authorisation.
// The file lives only in the private storage bucket (service role). Answers are rendered locally,
// never sent to Bailian or any external model, and always carry catalogue + PDF page references.
export const PRIVATE_CATALOG={bucket:'agent-private-knowledge',path:'wonly-catalog-v1.json'};
const CATALOG_NAMES={c1:'工程画册',c2:'零售画册',c3:'静音木门画册',c4:'真智能锁画册'};
const CATEGORY_NAMES={smart_lock:'智能锁',smart_door:'智能门',security_door:'防盗门',wooden_door:'木门',hospital_door:'医院门',school_door:'学校门',refuge_door:'避难门',fire_window:'防火窗',lock_body:'锁体',lock_core:'锁芯',hinge:'合页',door_viewer:'猫眼',other:'其他'};
const CATEGORY_WORDS=[['smart_lock',/智能锁|指纹锁|人脸锁|门锁|smart ?lock/i],['smart_door',/智能门|smart ?door/i],['security_door',/防盗门|入户门|钢门|security ?door/i],['wooden_door',/木门|静音门|室内门|wooden ?door/i],['hospital_door',/医院门|医疗门|病房门/],['school_door',/学校门|教室门/],['refuge_door',/避难门|避难间/],['fire_window',/防火窗/],['lock_body',/锁体/],['lock_core',/锁芯/],['hinge',/合页|铰链/],['door_viewer',/猫眼/]];
const SPEC_WORDS=/资料|产品信息|信息|产品介绍|了解|画册|型号|参数|规格|尺寸|厚度|等级|锁体|锁芯|门扇|门框|面板|颜色|配色|色号|认证|安装|维护|质保|适用|条件|标准|国标|功能|配置|开锁方式|屏幕|供电|电池|续航|区别|对比|差别|哪款|哪些|有什么|多少|是什么|介绍/;
const FILE_REQUEST=/发(给)?我|发一下|下载|文件|资料包|链接|PDF|pdf|原图|图片|视频/;
const fileDelivery=q=>FILE_REQUEST.test(q)&&!(/页码|出处|引用|来源|\bpages?\b|citations?|cite|references?/i.test(q)&&!/下载|发给|发送|发我|发一下|原图|资料包|链接|download|send/i.test(q));
const FACT_TOPICS=[['patents',/专利/],['rnd',/研发(投入|团队|人员|中心|基地)?/],['capacity',/产能|年产/],['bases',/生产基地|工厂|基地/],['listing',/上市|股票|605268/],['brand_value',/品牌价值/],['awards',/获奖|奖项|红点|iF/i],['challenge',/开锁挑战|百万挑战|挑战/],['landmarks',/地标|标杆项目|案例|项目业绩/],['developers',/开发商|地产商|百强/],['service',/服务网点|售后|服务团队/],['lock_core',/锁芯|C级|GA\/T/],['triple_protection',/三防分离|三重防护/],['remote_sensing',/远感|雷达/],['standards',/标准/],['fire_window',/防火窗/],['coating',/涂装|附着力|磷化/],['founding',/成立|创立|哪一年/]];
const CONFLICT_TOPICS={patents:/专利/,rnd_team:/研发(团队|人员|人数)/,users:/用户数|服务用户/,keyway:/钥匙槽|钥匙孔|键槽|keyway/i,lock_core_ratio:/锁芯|C级|A级|倍/,wood_leaf:/木门.*厚|门扇厚/,s80_colour:/S80/i};

const norm=s=>String(s||'').toUpperCase().replace(/[\s\-_/]+/g,'');
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function validCatalog(data){return data?.schema==='wonly-catalog-v1'&&Array.isArray(data.products)&&data.products.length<=5000&&Array.isArray(data.sources)}

let cache=null;
export async function loadCatalog(admin,now=Date.now()){
 if(cache&&now-cache.at<600000)return cache.data;
 try{const {data,error}=await admin.storage.from(PRIVATE_CATALOG.bucket).download(PRIVATE_CATALOG.path);if(error||!data||data.size>6*1024*1024)return null;const json=JSON.parse(await data.text());if(!validCatalog(json))return null;cache={at:now,data:json};return json}catch{return null}
}
export function resetCatalogCache(){cache=null}

// Speech transcripts may spell a model's digits in Chinese (X六零 -> X60).
export const normalizeModelQuestion=normalizeProductInput;
// Model codes are matched longest-first so "S80 Max" never also yields "S80".
export function findModels(question,catalog){
 let q=' '+normalizeModelQuestion(question).slice(0,500)+' ';
 const models=[...new Set((catalog?.products||[]).map(p=>p.model).filter(Boolean))].sort((a,b)=>norm(b).length-norm(a).length);
 const hits=[];
 for(const m of models){
  const n=norm(m);if(n.length<3)continue;
  const pat=m.trim().split(/[\s\-_/]+/).map(esc).join('[\\s\\-_/]*');
  const re=new RegExp('(^|[^A-Za-z0-9])('+pat+')(?![A-Za-z0-9]|[\\s_/.\\-]+(?:PRO|MAX|PLUS|ULTRA|LITE|BASIC|STANDARD)\\b)','i');const r=q.match(re);
  if(r){hits.push(m);const at=r.index+r[1].length;q=q.slice(0,at)+' '.repeat(r[2].length)+q.slice(at+r[2].length)}
 }
 const seen=new Set();return hits.filter(m=>{const k=norm(m);if(seen.has(k))return false;seen.add(k);return true}).slice(0,4);
}

// Cheap pre-check before the private file is downloaded.
export function catalogPrecheck(question){
 const q=normalizeModelQuestion(question).slice(0,500);
 // The fixed August index cannot answer a request constrained to another edition.
 if(materialVersion(q))return false;
 if(fileDelivery(q))return false;
 if(projectQuestion(q))return true;
 if(/王力|我们|我司|wonly/i.test(q)&&FACT_TOPICS.some(([,re])=>re.test(q)))return true;
 if(bareModel(q))return true;
 if(inventoryIntent(q)||selectionIntent(q))return true;
 // Factual company/product knowledge must not depend on a known model or “画册”.
 // CRM records, platform metrics and analytical workflows retain their own authorized sources.
 const operational=/询盘|客户|商机|合同|报价|员工|利润|营收|成本|统计|SEO|GSC|GA4|社媒|帖子|粉丝|tiktok|instagram|facebook|youtube|市场|营销|策略|计划|增长|投放|广告|\binquir(?:y|ies)\b|\bcustomers?\b|\bcontracts?\b|\bquotes?\b|\bstatistics\b|\bmarketing\b|\bstrategy\b|\bcampaigns?\b|operating system|computer software|操作系统/i.test(q);
 if(!operational&&((/王力|我们|我司|wonly/i.test(q)&&/什么|哪些|多少|哪年|哪里|介绍|说明|有没有|是否|情况|设计|工艺|材料|制造|技术|功能|\bwhat\b|\bwhich\b|\bwhere\b|\bwhen\b|describe|explain|technology|manufactur|design|materials?/i.test(q))||(/门|锁|门窗|五金|\bdoors?\b|\blocks?\b|\bwindows?\b|\bhardware\b/i.test(q)&&/设计|材质|材料|性能|工艺|参数|规格|型号|制造|技术|功能|厚度|尺寸|隔音|隔声|认证|安装|维护|质保|耐火|防火|design|materials?|performance|specifications?|parameters?|dimensions?|thickness|manufactur|technology|functions?/i.test(q))))return true;
 return /画册/.test(q)||(/\b[A-Za-z]{1,3}-?\d{2,4}[A-Za-z]?\b/.test(q)&&SPEC_WORDS.test(q))||(CATEGORY_WORDS.some(([,re])=>re.test(q))&&/型号|有哪些|哪几款|系列|产品线|参数|规格/.test(q));
}

export function catalogIntent(question,catalog){
 const q=normalizeModelQuestion(question).slice(0,500);
 if(!catalog)return null;
 if(fileDelivery(q))return null;
 const projects=projectIntent(q);if(projects)return projects;
 if(selectionIntent(q))return {kind:'selection'};
 if(inventoryIntent(q))return {kind:'inventory'};
 const models=findModels(q,catalog);
 const categories=CATEGORY_WORDS.filter(([,re])=>re.test(q)).map(([c])=>c);
 const facts=/画册|王力|我们|我司|wonly/i.test(q)?FACT_TOPICS.filter(([,re])=>re.test(q)).map(([t])=>t):[];
 if(models.length)return {kind:'models',models,categories};
 // A family shorthand is not an exact model: ask which catalogue variant is intended.
 const codes=q.match(/\b[A-Za-z]{1,3}-?\d{2,4}[A-Za-z]?\b/g)||[];
 const candidates=[...new Set((catalog.products||[]).map(p=>p.model).filter(m=>typeof m==='string'&&codes.some(c=>new RegExp('^'+esc(c.replace(/-/g,''))+'(?:[ \-_]+|$)','i').test(m.replace(/^(\w+)-(\d+)/,'$1$2')))))];
 if(candidates.length)return {kind:'model_choices',models:candidates.slice(0,8)};
 if(categories.length&&/型号|有哪些|哪几款|系列|产品线/.test(q))return {kind:'list',categories};
 if(facts.length)return {kind:'facts',topics:facts};
 if(/画册/.test(q)){const words=(q.match(/[A-Za-z][A-Za-z0-9.\-]{2,}/g)||[]).filter(w=>!/^(the|and|for|wonly)$/i.test(w));if(words.length)return {kind:'search',words:words.slice(0,5)}}
 return null;
}
export function fullCatalogueAnswer(intent,catalog,question=''){
 if(!catalog)return {status:'unavailable',answer:'本次未能读取公司私有画册索引，检索尚未完成，不能据此判断有无对应产品、参数或项目；不会改用外部模型猜测内部资料。',coverage:null,coverage_text:'画册索引未能读取，不能记为检索成功。'};
 const search=searchCatalogue(question,catalog,{models:intent?.models||[]});
 const answer=catalogAnswer(intent,catalog,question);
 return {status:'available',answer:answer||[HEAD(catalog),catalogueSearchFallback(search,{ref}),NOTE].join('\n\n'),coverage:search.coverage,coverage_text:catalogueSearchCoverage(search)};
}

const ref=(c,p)=>`${CATALOG_NAMES[c]||c} PDF第${p}页`;
const RANK={high:3,medium:2,low:1};
function card(model,catalog){
 const rows=catalog.products.filter(p=>p.model&&norm(p.model)===norm(model));
 if(!rows.length)return null;
 rows.sort((a,b)=>Object.keys(b.specs||{}).length-Object.keys(a.specs||{}).length||(RANK[b.confidence]||0)-(RANK[a.confidence]||0));
 const main=rows[0];
 const head=`【${main.model}】${main.name&&norm(main.name)!==norm(main.model)&&norm(main.name)!==norm(main.series)?main.name+'｜':''}${main.series?main.series+'｜':''}${CATEGORY_NAMES[main.category]||main.category}`;
 const lines=Object.entries(main.specs||{}).slice(0,16).map(([k,v])=>`- ${k}：${v}`);
 const diffs=[];
 for(const other of rows.slice(1))for(const [k,v] of Object.entries(other.specs||{}))if(main.specs?.[k]&&norm(main.specs[k])!==norm(v))diffs.push(`- ${k}：${ref(other.catalog,other.page)} 写作“${v}”`);
 const claims=[...new Set(rows.flatMap(r=>r.claims||[]))].slice(0,4).map(c=>`- 画册原文：${c}`);
 const unread=[...new Set(main.unreadable||[])];
 const others=[...new Set(rows.slice(1).map(r=>ref(r.catalog,r.page)))].filter(x=>x!==ref(main.catalog,main.page));
 return [head,...(lines.length?lines:['- 该页只印了型号与外观，未印参数。']),...claims,
  main.leaf_options?.length?`- 门扇形式：${main.leaf_options.join(' / ')}`:null,
  unread.length?`- 画册中看不清、未收录：${unread.join('、')}`:null,
  diffs.length?'画册之间写法不一致（以最新版或产品负责人确认为准）：\n'+diffs.slice(0,4).join('\n'):null,
  `出处：${ref(main.catalog,main.page)}${others.length?'；另见 '+others.slice(0,3).join('、'):''}${main.confidence!=='high'?'（小字页，建议对照原画册）':''}`].filter(Boolean).join('\n');
}
function conflictLines(question,catalog,models){
 const topics=Object.entries(CONFLICT_TOPICS).filter(([t,re])=>re.test(question)||models.some(m=>re.test(m))).map(([t])=>t);
 return (catalog.conflicts||[]).filter(c=>topics.includes(c.topic)).slice(0,3).map(c=>`注意：画册中“${c.label}”有不同说法——`+c.statements.map(s=>`${ref(s.catalog,s.page)}：“${s.text}”`).join('；')+'。对外使用前请产品负责人确认。');
}
const HEAD=catalog=>`按 ${String(catalog.sources?.[0]?.edition||'2026-08').replace(/^(\d{4})-(\d{2})$/,(m,y,mo)=>y+' 年 '+Number(mo)+' 月')}版海外画册：`;
const NOTE='（画册摘录，尚待产品负责人抽检；页码是 PDF 页码；本回答未发送给外部模型。）';
const TAIL='对外报价或投标前，以原画册和产品负责人确认的参数为准；画册没写的参数我不会补。'+NOTE;

function missingRequestedTopics(question,models,catalog){
 const rows=catalog.products.filter(p=>models.some(m=>norm(m)===norm(p.model)));
 const keys=rows.flatMap(p=>Object.keys(p.specs||{})).join(' '),missing=[];
 for(const [label,ask,fields] of [
  ['安装与维护',/安装|维护|保养/,/安装|维护|保养|install|maintenance/i],
  ['认证与测试条件',/认证|证书|测试条件/,/认证|证书|标准|certif|standard|test/i],
  ['交付与售后',/交期|保修|质保|售后/,/交期|保修|质保|售后|warranty|delivery/i]
 ])if(ask.test(question)&&!fields.test(keys))missing.push(`${label}：本次画册索引未取得这一项的明确字段，不能用行业常识补写；需要继续核对对应型号的现行手册或负责人。`);
 return missing.length?'本轮要求中的资料缺口：\n'+missing.join('\n'):'';
}
export function catalogAnswer(intent,catalog,question=''){
 if(!intent||!catalog)return null;
 if(intent.kind==='projects')return projectAnswer(intent,catalog,{ref,head:HEAD,note:NOTE});
 if(intent.kind==='model_choices')return '画册中有这些相关型号：'+intent.models.join('、')+'。请点击下方型号选项。确认完整型号后，我会按对应画册页给出参数和资料入口，避免混用不同版本。';
 if(intent.kind==='inventory')return inventoryAnswer(catalog,question);
 if(intent.kind==='selection')return selectionAnswer(catalog,question);
 if(intent.kind==='models'){
  const cards=intent.models.map(m=>card(m,catalog)).filter(Boolean);if(!cards.length)return null;
  const warn=conflictLines(question,catalog,intent.models);
  return [HEAD(catalog),...cards,...warn,missingRequestedTopics(question,intent.models,catalog),TAIL].filter(Boolean).join('\n\n');
 }
 if(intent.kind==='list'){
  const blocks=intent.categories.slice(0,2).map(cat=>{
   const rows=catalog.products.filter(p=>p.category===cat&&p.model);const by=new Map();
   for(const p of rows){const key=p.series||'未标系列';if(!by.has(key))by.set(key,new Map());const m=by.get(key);if(!m.has(norm(p.model)))m.set(norm(p.model),`${p.model}（${ref(p.catalog,p.page)}）`)}
   if(!by.size)return `${CATEGORY_NAMES[cat]}：画册中没有找到带型号的产品。`;
   return `${CATEGORY_NAMES[cat]}（共 ${[...by.values()].reduce((n,m)=>n+m.size,0)} 个型号）：\n`+[...by.entries()].slice(0,8).map(([s,m])=>`- ${s}：${[...m.values()].slice(0,12).join('、')}${m.size>12?` 等 ${m.size} 个`:''}`).join('\n');
  });
  return [HEAD(catalog),...blocks,'要看某个型号的参数，直接说型号，比如“X60 Pro 的参数”。'+NOTE].join('\n\n');
 }
 if(intent.kind==='facts'){
  const facts=(catalog.facts||[]).filter(f=>intent.topics.includes(f.topic)).slice(0,6);if(!facts.length)return null;
  const warn=conflictLines(question,catalog,[]);
  return [HEAD(catalog),facts.map(f=>`- 画册原文：“${f.text}”（${ref(f.catalog,f.page)}）`).join('\n'),...warn,'这些是画册里的公司宣传口径，对外引用时保持原文，不要改数字。'+NOTE].join('\n\n');
 }
 if(intent.kind==='search'){
  const words=intent.words.map(w=>w.toLowerCase());
  const hits=(catalog.pages||[]).map(p=>{const t=p.text.toLowerCase();const n=words.filter(w=>t.includes(w)).length;return {p,n}}).filter(x=>x.n).sort((a,b)=>b.n-a.n).slice(0,4);
  if(!hits.length)return null;
  const snip=(t,w)=>{const i=t.toLowerCase().indexOf(w);return t.slice(Math.max(0,i-80),i+160).trim()};
  return [HEAD(catalog)+'画册里这几页提到了（文字识别结果，可能有个别错字）：',...hits.map(({p})=>`- ${ref(p.catalog,p.page)}：…${snip(p.text,words.find(w=>p.text.toLowerCase().includes(w)))}…`),'要具体型号的参数，直接说型号就行。'+NOTE].join('\n\n');
 }
 return null;
}
export const catalogSpokenReply='我从海外画册里找到了相关内容，参数和页码都放在窗口里了。这些是画册摘录，对外使用前请以原画册为准。你还想对比哪个型号？';
