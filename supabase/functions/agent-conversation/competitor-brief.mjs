// Competitor battle cards and official price bands (owner, 2026-10-01). Built only from the bundled public
// official evidence (company profile, product range, channels, posted prices, specs) plus WONLY's own
// catalogue facts. Deterministic and in-house: nothing is sent to an external model, nothing is ranked
// across different test standards, and "切入点" lines are rules on stated facts, not conclusions.
import {PUBLIC_EVIDENCE,DIMENSIONS,CATEGORIES,mentionedCompanies} from './public-research.mjs';
import {wonlyFacts} from './wonly-compare.mjs';

const base=c=>String(c).replace(/（.*?）|\(.*?\)/g,'').trim();
const MARKET_NAME={SA:'沙特',AE:'阿联酋',MX:'墨西哥',CN:'中国',DE:'德国',IT:'意大利',CH:'瑞士',GB:'英国',US:'美国',ES:'西班牙',FR:'法国',KR:'韩国'};
const CURRENCY={MX:'墨西哥比索',SA:'沙特里亚尔',AE:'迪拉姆'};
const latest=ev=>[...new Set(ev.map(e=>e.accessed))].sort().at(-1)||'无';
const FOOT=ev=>`\n\n来源：全部是对方官网/官方资料（${latest(ev)} 访问，原文由工具提取、待人工逐字核对）；王力数据来自 2026 年 8 月版海外画册。系统内生成，没有发送给外部模型。`;

export function briefIntent(question){
 const q=String(question||'').slice(0,300);
 if(!/介绍|概况|是谁|什么来头|来头|底细|背景|怎么打|打法|怎么应对|应对|攻略|作战卡|battle ?card|了解一下|情况/i.test(q))return null;
 if(/最新|动态|新闻|情报/.test(q))return null;
 const companies=mentionedCompanies(q);
 return companies.length?{companies}:null;
}

const SECTIONS=['company_profile','market_presence','product_range','certification','channel','price'];
const short=u=>{try{const x=new URL(u);return x.hostname.replace(/^www\./,'')+x.pathname.replace(/\/$/,'').slice(0,40)}catch{return ''}};

function angles(rows,ours){
 const out=[],chan=rows.filter(e=>e.dimension==='channel'),price=rows.filter(e=>e.dimension==='price');
 const t=chan.map(e=>e.value+' '+e.quote).join(' ');
 if(/经销|distribuidor|dealer|代理/i.test(t))out.push('对方靠经销商/代理网络出货：优先找它经销网络没覆盖的城市，或它经销商以外的门窗五金店、工程商谈代理。');
 if(/Amazon|Mercado Libre|Claro Shop|电商|网店|online store|Tienda en línea|Sharaf|Liverpool|Elektra/i.test(t))out.push('对方在电商/连锁零售上架：我们的零售款进同一平台时，要对照它的公开标价和配送时效定价。');
 if(/不报价|no realizamos cotizaciones|不直接销售|venta directa/i.test(t))out.push('对方官网明确不直接报价、不直销：项目客户要通过它的经销商拿价，我们直接响应询盘、快速报价是差异点。');
 if(/展厅|showroom|仓库|bodega|warehouse/i.test(t))out.push('对方在当地有展厅/仓库（现货与交期优势）：我们要讲清楚交期、海外仓或样品支持。');
 if(price.length){const cur=[...new Set(price.map(e=>e.market))].map(m=>{const v=price.filter(e=>e.market===m).map(priceOf).filter(Boolean).sort((a,b)=>a-b);return v.length?`${MARKET_NAME[m]||m} ${fmt(v[0])}–${fmt(v.at(-1))} ${CURRENCY[m]||''}`:null}).filter(Boolean);
  if(cur.length)out.push(`对方官网公开价格带：${cur.join('；')}（${price.length} 个型号，含促销价）。报价时可作为当地零售参照。`);}
 const cats=[...new Set(rows.map(e=>e.category))];
 for(const c of cats){
  const theirCert=rows.filter(e=>e.category===c&&e.dimension==='certification').map(e=>e.value).slice(0,2);
  const ourCert=(ours[c]?.certification||[]).map(x=>`${x.value}（${x.ref}）`).slice(0,2);
  if(theirCert.length)out.push(`${CATEGORIES[c]}认证：对方主打 ${theirCert.join('；')}；王力画册${ourCert.length?'写的是 '+ourCert.join('；'):'没有写明同类认证，对外比较前要产品部补检测报告'}。`);
 }
 return out;
}

export function briefAnswer(intent,catalog,evidence=PUBLIC_EVIDENCE){
 const ours=wonlyFacts(catalog);
 const names=[...new Set(intent.companies.map(base))].slice(0,2);
 const parts=names.map(name=>{
  const rows=evidence.filter(e=>intent.companies.includes(e.company)&&base(e.company)===name);
  const markets=[...new Set(rows.map(e=>MARKET_NAME[e.market]||e.market))];
  const lines=[`■ ${name} 作战卡（${rows.length} 条官方资料；涉及 ${markets.join('、')}；门类：${[...new Set(rows.map(e=>CATEGORIES[e.category]))].join('、')}）`];
  for(const d of SECTIONS){const v=rows.filter(e=>e.dimension===d);if(!v.length)continue;
   lines.push(`【${DIMENSIONS[d].label}】\n`+v.slice(0,d==='price'?8:4).map(e=>`  · ${e.value}${d==='price'||d==='channel'?'｜'+(MARKET_NAME[e.market]||e.market):''}｜${short(e.source_url)}`).join('\n'));}
  const specs=rows.filter(e=>!SECTIONS.includes(e.dimension));
  if(specs.length)lines.push('【关键规格】\n'+specs.slice(0,6).map(e=>`  · ${e.product}｜${DIMENSIONS[e.dimension].label}：${e.value}`).join('\n'));
  const missing=SECTIONS.filter(d=>!rows.some(e=>e.dimension===d)).map(d=>DIMENSIONS[d].label);
  if(missing.length)lines.push(`（证据库还没有：${missing.join('、')}）`);
  const a=angles(rows,ours);
  if(a.length)lines.push('【可用切入点（基于上面事实的建议，不是结论）】\n'+a.map((x,i)=>`  ${i+1}. ${x}`).join('\n'));
  lines.push(`想看逐项参数对照，可以问“王力${CATEGORIES[rows[0]?.category]||'产品'}和${name}对比”。`);
  return lines.join('\n');
 });
 return parts.join('\n\n')+FOOT(evidence);
}

// ---- Official posted prices ----
export function priceOf(e){
 const m=String(e.quote||'').match(/(?:\$|SAR|AED|MXN)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/);
 return m?Number(m[1].replace(/,/g,'')):null;
}
const fmt=n=>n.toLocaleString('en-US');
const CAT_WORDS=[[/防火门/,'fire_door'],[/防盗门|安全门|入户门/,'security_door'],[/智能锁|门锁|指纹锁/,'smart_lock'],[/木门|室内门/,'wooden_door'],[/医用门|医疗门/,'medical_door']];
const MKT=[[/沙特/,'SA'],[/阿联酋|迪拜/,'AE'],[/墨西哥/,'MX'],[/中东|海湾/,'SA'],[/中东|海湾/,'AE']];
export function priceIntent(question){
 const q=String(question||'').slice(0,300);
 if(!/价格|售价|多少钱|价位|定价|标价|价格带|卖多少/.test(q))return null;
 if(/王力|我们的|我司|报价单|成本/.test(q))return null;
 const companies=mentionedCompanies(q);
 const categories=[...new Set(CAT_WORDS.filter(([re])=>re.test(q)).map(([,c])=>c))];
 const markets=[...new Set(MKT.filter(([re])=>re.test(q)).map(([,m])=>m))];
 if(!companies.length&&!/竞品|对手|同行|市场|当地/.test(q))return null;
 return {companies,categories,markets};
}
export function priceAnswer(intent,evidence=PUBLIC_EVIDENCE){
 let rows=evidence.filter(e=>e.dimension==='price'&&(!intent.companies.length||intent.companies.includes(e.company))&&(!intent.categories.length||intent.categories.includes(e.category)));
 if(intent.markets.length)rows=rows.filter(e=>intent.markets.includes(e.market));
 if(!rows.length)return `证据库里还没有${intent.markets.map(m=>MARKET_NAME[m]).join('/')}${intent.categories.map(c=>CATEGORIES[c]).join('/')}的竞品官网公开价格。目前收录的价格来自墨西哥和沙特的官网商城（智能锁为主）；阿联酋和防火门/工程门大多不公开标价，需要询价或看招标结果。`;
 const groups=[...new Set(rows.map(e=>e.market+'|'+e.category))].map(k=>{
  const [m,c]=k.split('|');const v=rows.filter(e=>e.market===m&&e.category===c).map(e=>({e,p:priceOf(e)})).filter(x=>x.p).sort((a,b)=>a.p-b.p);
  if(!v.length)return null;const mid=v[Math.floor(v.length/2)].p;
  return `■ ${MARKET_NAME[m]||m}·${CATEGORIES[c]}（${CURRENCY[m]||''}，${v.length} 个型号）：最低 ${fmt(v[0].p)}，中位 ${fmt(mid)}，最高 ${fmt(v.at(-1).p)}\n`+
   v.map(({e,p})=>`  ${fmt(p).padStart(6)}｜${base(e.company)} ${e.product}${/促销价|折扣/.test(e.value)&&!/非促销/.test(e.value)?'（促销价）':''}`).join('\n');
 }).filter(Boolean);
 return `竞品官网公开标价（${latest(rows)} 访问；只含对方官网商城挂出的零售价，不含工程/批发价，促销会变化）：\n\n`+groups.join('\n\n')+
  '\n\n怎么用：这是当地终端零售参照，不是我们的出厂价；比较时要看配置（是否带 WiFi 网关、人脸、摄像头）。原文由工具提取，待人工逐字核对；系统内生成，没有发送给外部模型。';
}
