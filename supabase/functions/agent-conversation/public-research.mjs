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
 steel_sheet:{label:'钢板厚度',match:/钢板|板厚|钢材厚度|sheet|gauge/i,query:'steel sheet thickness gauge'},
 leaf_thickness:{label:'门扇厚度',match:/门扇厚度|门板厚度|厚度|thickness/i,query:'door leaf thickness mm'},
 air_tightness:{label:'气密等级',match:/气密|密闭等级|air ?tight|12207/i,query:'air tightness class EN 12207'},
 ip_rating:{label:'防护等级',match:/IP\s?\d{2}|防护等级|防水等级/i,query:'IP rating ingress protection'},
 battery_life:{label:'电池续航',match:/电池|续航|battery/i,query:'battery life openings'},
 certification:{label:'认证',match:/认证|证书|certif|listed/i,query:'certification third party listing'}
};
const DIMS_BY_CATEGORY={fire_door:['fire_rating','acoustic','leaf_thickness','steel_sheet','certification'],security_door:['security_class','leaf_thickness','steel_sheet','acoustic','certification'],medical_door:['air_tightness','fire_rating','acoustic','certification'],smart_lock:['certification','ip_rating','battery_life']};
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

const CATEGORY_WORDS=[[/防火门|防火|fire/i,'fire_door'],[/防盗门|安全门|防盗|security door/i,'security_door'],[/医用门|医疗门|手术室|气密门|hospital/i,'medical_door'],[/智能锁|门锁|电子锁|smart lock/i,'smart_lock']];
const MARKET_WORDS=[[/沙特/,['SA']],[/阿联酋|迪拜|阿布扎比/,['AE']],[/中东|海湾/,['SA','AE','OM','QA','KW','BH']],[/墨西哥/,['MX']],[/英国/,['GB']],[/德国/,['DE']],[/西班牙/,['ES']],[/意大利/,['IT']],[/法国/,['FR']],[/爱尔兰/,['IE']],[/美国/,['US']],[/欧洲/,['DE','GB','FR','IT','ES','PL']]];
// Deterministic public-only answer for "竞品/对标" questions about a product category.
// Latest-news questions are left to the existing feed/web path.
export function competitorIntent(question){
 const q=String(question).slice(0,500);
 if(!/竞品|对标|竞争对手|同行|competitor/i.test(q)||/最新|动态|新闻|今天|近期|latest|news/i.test(q)||/背调|市场分析|机会|打法|策略|方案/.test(q))return null;
 const categories=[...new Set(CATEGORY_WORDS.filter(([re])=>re.test(q)).map(([,c])=>c))];
 const markets=[...new Set(MARKET_WORDS.filter(([re])=>re.test(q)).flatMap(([,m])=>m))];
 const dimension=Object.entries(DIMENSIONS).find(([,d])=>d.match.test(q))?.[0]||null;
 return {categories:categories.length?categories:Object.keys(CATEGORIES),markets,dimension,explicitCategory:categories.length>0};
}
export function competitorAnswer(intent,evidence=PUBLIC_EVIDENCE){
 let rows=evidence.filter(e=>intent.categories.includes(e.category)&&(!intent.dimension||e.dimension===intent.dimension));
 const inMarket=intent.markets.length?rows.filter(e=>intent.markets.includes(e.market)):rows;
 const scope=intent.categories.map(c=>CATEGORIES[c]).join('、')+(intent.dimension?'·'+DIMENSIONS[intent.dimension].label:'');
 const head=`以下只来自已收录的公开官方资料（${evidence.length}条，${[...new Set(evidence.map(e=>e.accessed))].sort().at(-1)||'无'}访问），均为候选对标，不代表已确认在同一项目竞争；没有引用本公司内部资料，也没有联网补充。`;
 if(!rows.length)return `${head}\n\n${scope}目前没有收录公开竞品证据，不能据此判断没有竞品。可以让我补充指定门类和市场的官方资料，或问“${intent.categories.map(c=>CATEGORIES[c])[0]}竞品最新动态”走联网检索。`;
 const other=intent.markets.length?rows.filter(e=>!intent.markets.includes(e.market)):[];
 const line=e=>`${e.company}·${e.product}｜${DIMENSIONS[e.dimension].label}：${e.value}｜市场 ${e.market}\n原文：${e.quote}${e.quote_verified?'':'（工具提取，待人工逐字核对）'}\n来源：${e.source_url}`;
 const groups=Object.keys(DIMENSIONS).map(d=>[d,(intent.markets.length?inMarket:rows).filter(e=>e.dimension===d)]).filter(([,v])=>v.length);
 return `${head}\n\n${scope}${intent.markets.length?'（'+intent.markets.join('/')+'）':''}：`
  +(groups.length?'\n'+groups.map(([d,v])=>`${DIMENSIONS[d].label}\n`+v.slice(0,6).map(line).join('\n')).join('\n\n'):'\n指定市场暂无收录证据。')
  +(other.length?`\n\n其他市场（仅供参考，标准和法规可能不同）：\n`+other.slice(0,4).map(line).join('\n'):'')
  +'\n\n不同企业采用的测试标准（如 BS、UL、EN）、尺寸和配置不同，数值不能直接排名。要和本公司产品对照，请按型号查询资料，我会在有同维度内部证据时并列显示。';
}
