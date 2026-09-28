// Public competitor evidence and research planning. Nothing here may carry internal
// product names, parameters, file text or customer data: queries are built only from
// fixed vocabularies, and evidence comes only from the bundled public file.
import evidenceFile from './competitor-evidence.json' with {type:'json'};

export const CATEGORIES={fire_door:'防火门',security_door:'防盗门',medical_door:'医用门',smart_lock:'智能锁'};
const CATEGORY_EN={fire_door:'fire rated steel door',security_door:'security steel door',medical_door:'hospital hermetic door',smart_lock:'smart door lock'};
export const DIMENSIONS={
 fire_rating:{label:'耐火等级',match:/耐火|防火等级|防火时间|耐火时间|fire/i,query:'fire resistance rating EI2 UL 10C BS 476'},
 acoustic:{label:'隔声',match:/隔音|隔声|acoustic|sound|rw/i,query:'sound insulation Rw dB'},
 security_class:{label:'防盗等级',match:/防盗等级|防破坏|RC\d|burglar/i,query:'burglar resistance class EN 1627'},
 leaf_thickness:{label:'门扇厚度',match:/门扇厚度|门板厚度|厚度|thickness/i,query:'door leaf thickness mm'},
 certification:{label:'认证',match:/认证|证书|certif|listed/i,query:'certification third party listing'}
};
const DIMS_BY_CATEGORY={fire_door:['fire_rating','acoustic','leaf_thickness','certification'],security_door:['security_class','leaf_thickness','acoustic','certification'],medical_door:['acoustic','certification'],smart_lock:['certification']};
const MARKET=/^[A-Z]{2}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():null;

export function validateEvidence(file){
 if(file?.schema!=='public-competitor-evidence-v1'||!Array.isArray(file.entries))return [];
 const ids=new Set();
 return file.entries.slice(0,500).flatMap(e=>{
  let url;try{url=new URL(e.source_url)}catch{return []}
  const ok=url.protocol==='https:'&&!url.username&&!url.password&&CATEGORIES[e.category]&&DIMENSIONS[e.dimension]&&MARKET.test(e.market||'')&&DATE.test(e.accessed||'')&&!Number.isNaN(Date.parse(e.accessed))
   &&text(e.id,80)&&!ids.has(e.id)&&text(e.company,80)&&text(e.product,120)&&text(e.value,160)&&text(e.quote,400)&&['official_datasheet','official_web_page','certification_body'].includes(e.source_type);
  if(!ok)return [];ids.add(e.id);
  return [{id:e.id,company:e.company.trim(),product:e.product.trim(),category:e.category,market:e.market,dimension:e.dimension,value:e.value.trim(),quote:e.quote.trim(),source_url:url.href,source_type:e.source_type,accessed:e.accessed,quote_verified:e.quote_check==='human_verified'}];
 });
}
export const PUBLIC_EVIDENCE=validateEvidence(evidenceFile);

export function evidenceFor(category,evidence=PUBLIC_EVIDENCE){return evidence.filter(e=>e.category===category)}

// Fixed public queries for a background research task. Only whitelisted category/market/dimension
// tokens are used; anything else yields no query rather than a partial one.
export function researchQueries(category,market){
 if(!CATEGORIES[category]||(market!==undefined&&!MARKET.test(market)))return [];
 return DIMS_BY_CATEGORY[category].map(d=>({category,market:market||null,dimension:d,query:`${CATEGORY_EN[category]} ${DIMENSIONS[d].query}${market?' '+market:''} manufacturer datasheet`}));
}

export function dimensionOf(field){return Object.entries(DIMENSIONS).find(([,d])=>d.match.test(String(field)))?.[0]||null}

// Side-by-side rows only: internal machine extraction next to public statements of the same
// dimension. No ranking, no winner, no inference across different test standards.
export function comparisonRows(findings,categories,evidence=PUBLIC_EVIDENCE){
 const rows=[];
 for(const f of findings||[]){
  const dim=dimensionOf(f.field);if(!dim)continue;
  const pub=evidence.filter(e=>e.dimension===dim&&categories.includes(e.category));
  if(pub.length)rows.push({dimension:dim,label:DIMENSIONS[dim].label,internal:{value:f.value,page:f.page,asset:f.asset},public:pub.slice(0,3)});
 }
 const seen=new Set();return rows.filter(r=>{const k=r.dimension+'|'+r.internal.value;if(seen.has(k))return false;seen.add(k);return true}).slice(0,4);
}

export function comparisonText(rows){
 if(!rows.length)return '';
 return '\n同维度对照（仅并列事实，不排名、不判断优劣；测试标准、适用尺寸和配置不同则不可直接比较）：\n'+rows.map(r=>`${r.label}｜本公司资料（机器提取，未核验）：${r.internal.value}（${r.internal.asset} 第${r.internal.page}页）\n`+r.public.map(p=>`  ${p.company}·${p.product}（候选对标，未确认直接竞争）：${p.value}｜${p.market}｜官网资料 ${p.accessed} 访问${p.quote_verified?'':'，原文待人工逐字核对'}｜${p.source_url}`).join('\n')).join('\n');
}
