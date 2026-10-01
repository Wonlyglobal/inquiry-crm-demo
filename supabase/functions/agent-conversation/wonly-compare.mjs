// WONLY vs competitors (owner, 2026-10-01): puts WONLY's own catalogue facts (2026-08 overseas catalogues,
// page-cited) next to public official competitor evidence, dimension by dimension. Deterministic and
// in-house only: nothing here is sent to an external model. It does not rank where standards differ;
// it says plainly which dimensions WONLY's catalogue does not state yet.
import {PUBLIC_EVIDENCE,DIMENSIONS,CATEGORIES,mentionedCompanies} from './public-research.mjs';

const CAT_OF={security_door:'security_door',smart_door:'security_door',smart_lock:'smart_lock',wooden_door:'wooden_door',hospital_door:'medical_door'};
const KEY_DIM=[
 [/^(grade|burglary resistance)$/i,'security_class'],[/^standard$/i,'certification'],[/^thickness$/i,'leaf_thickness'],
 [/^(material|front panel|core fill|door leaf)$/i,'material'],[/^(standard features|unlocking)$/i,'unlock_methods'],[/^power$/i,'battery_life']
];
const CATALOG_NAME={c1:'工程画册',c2:'零售画册',c3:'静音木门画册',c4:'真智能锁画册'};

// Catalogue products -> {category: {dimension: [{value, models[], ref}]}} (distinct values, most common first).
export function wonlyFacts(catalog){
 const out={};
 for(const p of Array.isArray(catalog?.products)?catalog.products:[]){
  const cat=CAT_OF[p.category];if(!cat)continue;
  for(const [k,v] of Object.entries(p.specs||{})){
   const dim=KEY_DIM.find(([re])=>re.test(k))?.[1];if(!dim||typeof v!=='string'||!v.trim())continue;
   const value=v.trim().slice(0,140),bucket=((out[cat]??={})[dim]??=new Map());
   const row=bucket.get(value)||{value,models:[],ref:`${CATALOG_NAME[p.catalog]||p.catalog} PDF第${p.page}页`};
   if(row.models.length<4&&p.model&&!row.models.includes(p.model))row.models.push(p.model);bucket.set(value,row);row.n=(row.n||0)+1;
  }
 }
 for(const cat of Object.keys(out))for(const dim of Object.keys(out[cat]))out[cat][dim]=[...out[cat][dim].values()].sort((a,b)=>b.n-a.n).slice(0,3);
 return out;
}

const CATEGORY_WORDS=[[/防火门|防火/,'fire_door'],[/防盗门|安全门|入户门|智能门|防盗/,'security_door'],[/医用门|医疗门|手术室/,'medical_door'],[/智能锁|门锁|指纹锁/,'smart_lock'],[/木门|隔音门|静音门|室内门/,'wooden_door']];
const MARKETS=[[/沙特/,['SA']],[/阿联酋|迪拜/,['AE']],[/中东|海湾/,['SA','AE']],[/墨西哥/,['MX']]];
export function compareIntent(question){
 const q=String(question||'').slice(0,300);
 const companies=mentionedCompanies(q);
 const versus=/对比|比较|相比|比一比|vs\.?|差距|优势|劣势|强弱|谁强|哪个好|有什么区别/i.test(q);
 const ours=/王力|我们|我司|wonly/i.test(q);
 if(!versus||!(ours||companies.length||/竞品|对手|同行/.test(q)))return null;
 const categories=[...new Set(CATEGORY_WORDS.filter(([re])=>re.test(q)).map(([,c])=>c))];
 const markets=[...new Set(MARKETS.filter(([re])=>re.test(q)).flatMap(([,m])=>m))];
 return {categories,markets,companies};
}

export function compareAnswer(intent,catalog,evidence=PUBLIC_EVIDENCE){
 const ours=wonlyFacts(catalog);
 let pool=evidence.filter(e=>(!intent.companies.length||intent.companies.includes(e.company)));
 const cats=intent.categories.length?intent.categories:[...new Set(pool.map(e=>e.category))].filter(c=>ours[c]||intent.companies.length).slice(0,3);
 if(!cats.length)return '还没有可以对比的门类：请说明门类（防盗门、智能锁、木门、防火门、医用门）或竞品品牌，例如“王力智能锁和凯迪仕对比”。';
 const sections=[];
 for(const cat of cats){
  let rows=pool.filter(e=>e.category===cat);
  if(intent.markets.length){const m=rows.filter(e=>intent.markets.includes(e.market));if(m.length)rows=m}
  const dims=[...new Set([...Object.keys(ours[cat]||{}),...rows.map(e=>e.dimension)])].filter(d=>DIMENSIONS[d]&&d!=='market_presence');
  const lines=[],gaps=[];
  for(const d of dims){
   const w=ours[cat]?.[d]||[],c=rows.filter(e=>e.dimension===d).slice(0,3);
   if(!w.length&&!c.length)continue;
   if(!w.length){gaps.push(DIMENSIONS[d].label);}
   lines.push(`【${DIMENSIONS[d].label}】\n  王力：`+(w.length?w.map(x=>`${x.value}（${x.models.join('、')}；${x.ref}）`).join('；'):'画册未写明')+
    (c.length?'\n'+c.map(e=>`  ${e.company}·${e.product}：${e.value}｜${e.source_url}`).join('\n'):'\n  竞品：证据库暂无同维度资料'));
  }
  const presence=rows.filter(e=>e.dimension==='market_presence').slice(0,3);
  sections.push(`■ ${CATEGORIES[cat]}${intent.markets.length?'（'+intent.markets.join('/')+'）':''}\n`+(lines.join('\n')||'暂无可对照的维度。')+
   (presence.length?'\n【竞品市场布局（对方自述）】\n'+presence.map(e=>`  ${e.company}：${e.value}`).join('\n'):'')+
   (gaps.length?`\n→ 王力画册没有写明：${gaps.join('、')}。对外比较前，需要产品部补充有检测报告支撑的数据。`:''));
 }
 return `王力 vs 竞品（王力数据来自 2026 年 8 月版海外画册，带页码；竞品来自官方公开资料，${[...new Set(evidence.map(e=>e.accessed))].sort().at(-1)} 访问，原文待人工逐字核对）：\n\n`+sections.join('\n\n')+
  '\n\n怎么看：只有测试标准相同（如都是 UL 10C 或都是 EN 1627）时数值才能直接比高低；GB 国标等级和 EN/UL 等级不能直接换算。这份对照在公司系统内生成，没有发送给外部模型。';
}
