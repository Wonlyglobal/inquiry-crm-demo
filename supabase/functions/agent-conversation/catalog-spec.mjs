// Spec questions without a model code ("防火门耐火多久", "木门隔音多少分贝", "有没有 RC3 的门") are answered
// from WONLY's own catalogue (owner, 2026-10-03): values with models and PDF pages, or a plain "画册未写明".
// Never filled in with generic industry numbers. Deterministic and in-house only.
const CATALOG_NAMES={c1:'工程画册',c2:'零售画册',c3:'静音木门画册',c4:'真智能锁画册'};
const CATS=[
 ['fire',/防火门|防火窗|防火/,['fire_window','security_door','hospital_door','school_door','refuge_door'],'防火门/窗'],
 ['wooden_door',/木门|静音门|室内门/,['wooden_door'],'木门'],
 ['smart_lock',/智能锁|指纹锁|人脸锁|门锁/,['smart_lock'],'智能锁'],
 ['security_door',/防盗门|入户门|钢门|安全门/,['security_door','smart_door'],'防盗门'],
 ['any',/门/,null,'门'],
];
export const SPEC_DIMS=[
 ['fire_rating','耐火时间/等级',/耐火|防火等级|防火时间|EI ?\d|防火.{0,6}(多久|几小时|多长时间)/i,/fire|耐火|防火|EI\b|resist/i,/\bEI ?\d{2,3}\b|\b\d{2,3}\s?min|耐火.{0,6}\d|[0-9.]+\s?(h|小时)/i],
 ['acoustic','隔声',/隔音|隔声|分贝|dB|静音|噪音/i,/sound|acoustic|隔音|隔声|noise|dB/i,/\d{2}\s?dB|R[wW]\s?\d{2}|隔(音|声).{0,6}\d/],
 ['security_class','防盗等级',/防盗等级|RC ?\d|EN ?1627|grade|等级/i,/grade|burglary|security class|防盗|RC\d|EN ?1627/i,/\bRC ?\d\b|EN ?1627|grade ?[A-D]\b|[甲乙丙丁]级|防盗.{0,4}级/i],
 ['thickness','厚度',/厚度|多厚|门扇厚|板厚|钢板/,/thickness|厚/i,/\d+(\.\d+)?\s?mm/i],
 ['unlock','开锁方式',/开锁方式|怎么开|解锁|指纹|人脸|掌静脉|密码/,/unlock|开锁|standard features/i,/fingerprint|face|palm|password|card|指纹|人脸|掌静脉|密码|卡/i],
 ['certification','认证/标准',/认证|标准|证书|CE|UL\b|EN ?\d/i,/standard|certif|认证|标准/i,/\b(CE|UL ?10[BC]|EN ?\d{3,5}|BS ?476|GB ?\/?T? ?\d{4,5})\b/i],
];
const STRONG=new Set(['fire_rating','acoustic','security_class']);
const MODEL_CODE=/\b[A-Za-z]{1,3}-?\d{2,4}[A-Za-z]?\b/;

export function specIntent(question){
 const q=String(question||'').slice(0,300);
 if(/竞品|对手|同行|对比|比较|价格|多少钱|发我|下载|PDF|视频/i.test(q))return null;
 const cat=CATS.find(([,re])=>re.test(q));if(!cat)return null;
 const dim=SPEC_DIMS.find(([,,ask])=>ask.test(q));if(!dim)return null;
 if(cat[0]==='any'&&!/有没有|有哪些|哪款|哪些门|什么门/.test(q))return null;
 const want=(q.match(/\bRC ?\d\b|EI ?\d{2,3}|\d{2,3}\s?(?:min|分钟)|\d{2}\s?dB/i)||[''])[0].replace(/\s/g,'').toUpperCase();
 const hasModel=MODEL_CODE.test(q.replace(/\bRC ?\d\b|EI ?\d{2,3}|EN ?\d{3,5}|UL ?\d+\w?|\d{2}\s?dB/gi,''));if(hasModel)return null;
 return {cat:cat[0],categories:cat[2],catLabel:cat[3],dim:dim[0],dimLabel:dim[1],want};
}

const ref=(c,p)=>`${CATALOG_NAMES[c]||c} PDF第${p}页`;
export function specAnswer(intent,catalog){
 if(!intent||!catalog)return null;
 const dim=SPEC_DIMS.find(d=>d[0]===intent.dim);const [,label,,keyRe,valRe]=dim;
 const products=(catalog.products||[]).filter(p=>!intent.categories||intent.categories.includes(p.category));
 const rows=new Map();
 for(const p of products)for(const [k,v] of Object.entries(p.specs||{})){
  if(typeof v!=='string'||!v.trim())continue;
  if(!(keyRe.test(k)||(STRONG.has(intent.dim)&&valRe.test(v))))continue;
  const value=v.trim().slice(0,120),row=rows.get(value)||{value,models:[],refs:new Set()};
  if(p.model&&row.models.length<5&&!row.models.includes(p.model))row.models.push(p.model);row.refs.add(ref(p.catalog,p.page));rows.set(value,row);
 }
 let list=[...rows.values()];
 const wantRe=intent.want?new RegExp(intent.want.replace(/(\d)/,'\\s?$1'),'i'):null;
 const matched=wantRe?list.filter(r=>wantRe.test(r.value)):list;
 const pageHits=[];
 if(!list.length)for(const pg of catalog.pages||[]){const t=String(pg.text||'');const m=t.match(valRe);if(m){const i=m.index;pageHits.push(`- ${ref(pg.catalog,pg.page)}：…${t.slice(Math.max(0,i-60),i+80).replace(/\s+/g,' ').trim()}…`)}if(pageHits.length>=3)break}
 const head=`王力海外画册（2026 年 8 月版）里关于${intent.catLabel}「${label}」的写法：`;
 const tail='\n\n以上只来自画册，系统内查找，没有发送给外部模型；对外报价或投标前，以检测报告为准。';
 if(!list.length&&!pageHits.length)return `王力海外画册（2026 年 8 月版）里没有写明${intent.catLabel}的「${label}」。\n\n我不会用行业通用数值代替王力的参数——对外回答客户前，请产品部提供有检测报告支撑的数据；也可以说具体型号，我按型号再查一次。`+tail;
 if(!list.length)return `画册的产品参数表里没有${intent.catLabel}「${label}」这一项，但正文里有这些提法（文字识别结果，可能有错字）：\n${pageHits.join('\n')}`+tail;
 const lines=(matched.length?matched:list).slice(0,8).map(r=>`- ${r.value}（${r.models.join('、')||'未标型号'}；${[...r.refs].slice(0,2).join('、')}）`);
 const wantNote=intent.want?(matched.length?`\n\n符合你问的 ${intent.want} 的有 ${matched.length} 种写法，见上。`:`\n\n画册里没有找到明确标为 ${intent.want} 的产品；上面是画册里现有的${label}写法，等级体系不同（如 GB 国标与 EN）不能直接换算。`):'';
 return head+'\n'+lines.join('\n')+wantNote+tail;
}
