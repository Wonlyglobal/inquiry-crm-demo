import {selectionIntent,selectionAnswer} from './product-selection.mjs';
import {inventoryIntent,inventoryAnswer} from './product-inventory.mjs';
// Deterministic answers from the private WONLY overseas catalogue knowledge (wonly-catalog-v1).
// Source: the four 2026-08 overseas catalogues, read by Claude under Chloe's 2026-09-28 authorisation.
// The file lives only in the private storage bucket (service role). Answers are rendered locally,
// never sent to Bailian or any external model, and always carry catalogue + PDF page references.
export const PRIVATE_CATALOG={bucket:'agent-private-knowledge',path:'wonly-catalog-v1.json'};
const CATALOG_NAMES={c1:'工程画册',c2:'零售画册',c3:'静音木门画册',c4:'真智能锁画册'};
const CATEGORY_NAMES={smart_lock:'智能锁',smart_door:'智能门',security_door:'防盗门',wooden_door:'木门',hospital_door:'医院门',school_door:'学校门',refuge_door:'避难门',fire_window:'防火窗',lock_body:'锁体',lock_core:'锁芯',hinge:'合页',door_viewer:'猫眼',other:'其他'};
const CATEGORY_WORDS=[['smart_lock',/智能锁|指纹锁|人脸锁|门锁|smart ?lock/i],['smart_door',/智能门|smart ?door/i],['security_door',/防盗门|入户门|钢门|security ?door/i],['wooden_door',/木门|静音门|室内门|wooden ?door/i],['hospital_door',/医院门|医疗门|病房门/],['school_door',/学校门|教室门/],['refuge_door',/避难门|避难间/],['fire_window',/防火窗/],['lock_body',/锁体/],['lock_core',/锁芯/],['hinge',/合页|铰链/],['door_viewer',/猫眼/]];
const SPEC_WORDS=/画册|型号|参数|规格|尺寸|厚度|等级|锁体|锁芯|门扇|门框|面板|颜色|配色|色号|认证|标准|国标|功能|配置|开锁方式|屏幕|供电|电池|续航|区别|对比|差别|哪款|哪些|有什么|多少|是什么|介绍/;
const FILE_REQUEST=/发(给)?我|发一下|下载|文件|资料包|链接|PDF|pdf|原图|图片|视频/;
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

// Model codes are matched longest-first so "S80 Max" never also yields "S80".
export function findModels(question,catalog){
 let q=' '+String(question||'').slice(0,500)+' ';
 const models=[...new Set((catalog?.products||[]).map(p=>p.model).filter(Boolean))].sort((a,b)=>norm(b).length-norm(a).length);
 const hits=[];
 for(const m of models){
  const n=norm(m);if(n.length<3)continue;
  const pat=m.trim().split(/[\s\-_/]+/).map(esc).join('[\\s\\-_/]*');
  const re=new RegExp('(^|[^A-Za-z0-9])('+pat+')(?![A-Za-z0-9])','i');const r=q.match(re);
  if(r){hits.push(m);const at=r.index+r[1].length;q=q.slice(0,at)+' '.repeat(r[2].length)+q.slice(at+r[2].length)}
 }
 const seen=new Set();return hits.filter(m=>{const k=norm(m);if(seen.has(k))return false;seen.add(k);return true}).slice(0,4);
}

// Cheap pre-check before the private file is downloaded.
export function catalogPrecheck(question){
 const q=String(question||'').slice(0,500);
 if(inventoryIntent(q)||selectionIntent(q))return true;
 if(FILE_REQUEST.test(q))return false;
 return /画册/.test(q)||(/\b[A-Za-z]{1,3}-?\d{2,4}[A-Za-z]?\b/.test(q)&&SPEC_WORDS.test(q))||(CATEGORY_WORDS.some(([,re])=>re.test(q))&&/型号|有哪些|哪几款|系列|产品线|参数|规格/.test(q));
}

export function catalogIntent(question,catalog){
 const q=String(question||'').slice(0,500);
 if(!catalog)return null;
 if(selectionIntent(q))return {kind:'selection'};
 if(inventoryIntent(q))return {kind:'inventory'};
 if(FILE_REQUEST.test(q))return null;
 const models=findModels(q,catalog);
 const categories=CATEGORY_WORDS.filter(([,re])=>re.test(q)).map(([c])=>c);
 const facts=/画册/.test(q)?FACT_TOPICS.filter(([,re])=>re.test(q)).map(([t])=>t):[];
 if(models.length)return {kind:'models',models,categories};
 if(categories.length&&/型号|有哪些|哪几款|系列|产品线/.test(q))return {kind:'list',categories};
 if(facts.length)return {kind:'facts',topics:facts};
 if(/画册/.test(q)){const words=(q.match(/[A-Za-z][A-Za-z0-9.\-]{2,}/g)||[]).filter(w=>!/^(the|and|for|wonly)$/i.test(w));if(words.length)return {kind:'search',words:words.slice(0,5)}}
 return null;
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

export function catalogAnswer(intent,catalog,question=''){
 if(!intent||!catalog)return null;
 if(intent.kind==='inventory')return inventoryAnswer(catalog,question);
 if(intent.kind==='selection')return selectionAnswer(catalog,question);
 if(intent.kind==='models'){
  const cards=intent.models.map(m=>card(m,catalog)).filter(Boolean);if(!cards.length)return null;
  const warn=conflictLines(question,catalog,intent.models);
  return [HEAD(catalog),...cards,...warn,TAIL].join('\n\n');
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
