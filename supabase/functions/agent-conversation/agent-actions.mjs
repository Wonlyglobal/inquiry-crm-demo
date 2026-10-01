// "Open it for me": the agents can hand the browser a small list of safe actions to perform —
// open a CRM page in a new window, open competitors' official source pages, or run a web search.
// Actions are allowlisted here AND re-checked in the browser. Nothing is sent to an external model:
// these answers are deterministic. Customer data never goes into a search URL.
import evidence from './competitor-evidence.json' with {type:'json'};

export const OPEN_VERB=/打开|调出|调取|弹出|跳转|给我看|帮我看|展示|显示|开一下|开个窗口|新窗口|浏览器/;
export const CRM_VIEWS=[
 ['dashboard','经营看板',/经营看板|看板|仪表盘/],['sales-today','今日工作台',/今日工作台|工作台|今天的任务/],['follow-calendar','跟进日历',/跟进日历|日历/],
 ['marketing-center','市场任务中心',/市场任务|营销中心|市场中心/],['inquiries','询盘商机',/询盘|商机/],['customers','客户管理',/客户管理|客户列表|客户库/],
 ['mailbox','我的邮箱',/邮箱|收件箱/],['whatsapp','WhatsApp Business',/whatsapp/i],['templates','我的模板',/模板/],['knowledge','销售知识库',/知识库/],
 ['quotes','报价管理',/报价/],['fulfillment','履约跟踪',/履约|发货|订单跟踪/],['email','邮件分拣',/邮件分拣/],['communications','客户沟通记录',/沟通记录/],
 ['assignment','待分配池',/待分配/],['nurture','市场培育池',/培育池/],['public-pool','客户公海',/公海/],['research','客户背调',/背调/],
 ['legacy-projects','历史工程',/历史工程|工程项目/],['daily','销售日报',/日报/],['performance-360','360 评分中心',/360|评分中心/],['risk-review','风险审查中心',/风险审查/],
];
export const CRM_ORIGIN='https://crm.foreverdoodle.com/';
const ALIASES={'hörmann':/h[oö]e?rmann|霍曼/i,'assa abloy':/assa\s*abloy|亚萨合莱/i,'dormakaba':/dorma\s*kaba|多玛凯拔|dorma/i,'portalp':/portalp/i,'manusa':/manusa/i,'oikos':/oikos/i,'dortek':/dortek/i,
 'al barrak':/al\s*barrak/i,'fhc mfg':/fhc/i,'sffeco':/sffeco/i,'hmi':/\bhmi\b/i,'red flames':/red\s*flames/i,'vulcan':/vulcan/i,'miacasa':/miacasa/i,'puertas asturmex':/asturmex/i};
const SENSITIVE=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+|00)\d[\d \-]{7,}|\b\d{7,}\b|sk-[A-Za-z0-9_-]{8,}|(?:密码|密钥|口令)/i;
const baseName=c=>String(c).replace(/（.*?）|\(.*?\)/g,'').trim().toLowerCase();

export function safeUrl(u){try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password&&!x.port?x.href:null}catch{return null}}
// Competitor evidence shows as a card in the Grace timeline (official quote + date); the original page
// only opens when the user clicks its link.
export function evidenceCard(e,url=safeUrl(e.source_url)){return {type:'evidence',id:e.id,company:e.company,product:e.product,market:e.market||null,value:e.value,quote:e.quote,accessed:e.accessed,source_type:e.source_type,url,label:`${e.company} · ${e.product}`}}
export function evidenceById(id,entries=evidence.entries){const e=entries.find(x=>x.id===id);return e?evidenceCard(e):null}
export function competitorLinks(question,entries=evidence.entries){
 const q=String(question);const hit=entries.filter(e=>{const k=baseName(e.company);const re=ALIASES[k];return re?re.test(q):q.toLowerCase().includes(k)});
 const seen=new Set(),out=[];
 for(const e of hit){const url=safeUrl(e.source_url);if(!url||seen.has(e.id))continue;seen.add(e.id);out.push(evidenceCard(e,url))}
 return out.slice(0,5);
}
export function actionIntent(question){
 const q=String(question||'').trim();if(!OPEN_VERB.test(q)||q.length>200)return null;
 const strong=/打开|调出|调取|弹出|跳转|开一下|开个窗口|新窗口|浏览器/.test(q);
 const views=!strong?[]:CRM_VIEWS.filter(([,,re])=>re.test(q)).slice(0,2).map(([view,label])=>({type:'crm_view',view,label,url:CRM_ORIGIN+'#view='+view}));
 const m=q.match(/(?:谷歌|google|百度|必应|bing|网上|网页)?(?:搜索|搜一下|搜|查一下)[:：\s]*(.{2,80})$/i);
 let search=null;
 if(m&&/搜/.test(q)){const words=m[1].replace(/^(一下|下)/,'').replace(/[。！!？?]+$/,'').trim();if(words.length>=2&&!SENSITIVE.test(words)){const engine=/百度/.test(q)?'https://www.baidu.com/s?wd=':/必应|bing/i.test(q)?'https://www.bing.com/search?q=':'https://www.google.com/search?q=';search={type:'web_search',query:words,url:engine+encodeURIComponent(words),label:`搜索：${words}`}}}
 const competitors=competitorLinks(q);
 const blocked=!!(m&&/搜/.test(q)&&!search);
 if(!views.length&&!search&&!competitors.length&&!blocked)return null;
 return {views,search,competitors,blocked};
}
export function actionAnswer(intent){
 const actions=[...intent.views,...(intent.search?[intent.search]:[]),...intent.competitors].slice(0,6);
 if(!actions.length)return intent.blocked?{answer:'这个搜索内容里有联系方式或敏感信息，我不会把它放进搜索网址。请换成公司名或产品关键词再试。',actions:[]}:null;
 const lines=actions.map(a=>`- ${a.label}`).join('\n');
 const answer=`放在左边需求时间线的窗口里了：\n${lines}`+(intent.competitors.length?'\n\n竞品卡片摘自官方资料原文并标了核验日期，参数以原网页为准，需要时点卡片里的链接看原页。':'')+(intent.search?'\n\n搜索只包含你给的关键词，不含客户资料。':'');
 return {answer,actions};
}
export const actionsSpoken='好的，放在左边的需求时间线里了，直接在这个页面就能看。';
// Browser-side re-check uses the same rule set.
export const ALLOWED_HOSTS=[...new Set([...evidence.entries.map(e=>{try{return new URL(e.source_url).hostname}catch{return null}}).filter(Boolean),'www.google.com','www.baidu.com','www.bing.com','crm.foreverdoodle.com'])];
// Category / market requests ("打开沙特防火门竞品") pick sources the same way competitorAnswer does.
export function competitorLinksFromIntent(ci,entries=evidence.entries){
 if(!ci)return [];let rows=entries.filter(e=>ci.categories.includes(e.category)&&(!ci.dimension||e.dimension===ci.dimension));
 if(ci.markets?.length){const inMarket=rows.filter(e=>ci.markets.includes(e.market));if(inMarket.length)rows=inMarket}
 const seen=new Set(),out=[];for(const e of rows){const url=safeUrl(e.source_url);if(!url||seen.has(e.id))continue;seen.add(e.id);out.push(evidenceCard(e,url))}
 return out.slice(0,5);
}

// ---- Open a specific CRM record or catalogue page ----
const STRONG=/打开|调出|调取|弹出|跳转|开一下|新窗口|浏览器/;
const GENERIC=/^(?:列表|全部|所有|今天|今日|我的|新|最新|待分配|公海|管理|这个|那个|一下|客户|询盘)$/;
export function recordIntent(question){
 const q=String(question||'').trim();if(!STRONG.test(q)||q.length>120)return null;
 let m=q.match(/询盘\s*(?:号|编号)?\s*#?\s*(\d{1,7})(?!\d)/)||q.match(/#\s*(\d{1,7})\s*号?\s*询盘/)||q.match(/(\d{1,7})\s*号询盘/);
 if(m)return {kind:'inquiry_no',no:Number(m[1])};
 m=q.match(/(?:打开|调出|调取|跳转到?)(?:一下)?\s*(.{2,40}?)\s*的?\s*(?:询盘|客户|商机|详情)(?:页|页面|详情)?[。！!]*$/);
 if(!m)return null;const name=m[1].replace(/^(?:客户|公司)\s*/,'').trim();
 if(name.length<2||GENERIC.test(name)||/[%_\\]/.test(name))return null;
 return {kind:'company',name:name.slice(0,40)};
}
// `client` is the caller's own authenticated client, so row-level security decides what can be found.
export async function resolveRecords(intent,client){
 try{
  if(intent.kind==='inquiry_no'){const {data}=await client.from('inquiries').select('id,inquiry_no,title,companies(name)').eq('inquiry_no',intent.no).limit(1);return (data||[]).map(r=>({id:r.id,no:r.inquiry_no,title:r.title,company:r.companies?.name||''}))}
  const {data:companies}=await client.from('companies').select('id,name').ilike('name','%'+intent.name+'%').limit(5);
  if(!companies?.length)return [];
  const {data:rows}=await client.from('inquiries').select('id,inquiry_no,title,company_id,updated_at').in('company_id',companies.map(c=>c.id)).order('updated_at',{ascending:false}).limit(5);
  const names=new Map(companies.map(c=>[c.id,c.name]));return (rows||[]).map(r=>({id:r.id,no:r.inquiry_no,title:r.title,company:names.get(r.company_id)||''}));
 }catch{return []}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function recordAnswer(intent,records){
 const list=records.filter(r=>UUID.test(String(r.id))).slice(0,3);
 if(!list.length)return {answer:intent.kind==='inquiry_no'?`没有找到 #${intent.no} 号询盘，或你的账号没有查看权限。`:`CRM 里没有找到名称包含“${intent.name}”的客户询盘，或你的账号没有查看权限。可以换个名称关键词，或说“打开询盘 编号”。`,actions:[]};
 const actions=list.map(r=>({type:'crm_record',id:r.id,url:CRM_ORIGIN+'#inquiry/'+r.id,label:`询盘 #${r.no}${r.company?' · '+r.company:''}`}));
 return {answer:`${list.length>1?'这几条':'这条'}询盘详情放在左边需求时间线的窗口里：\n`+list.map(r=>`- #${r.no}｜${r.company||'未关联公司'}｜${String(r.title||'').slice(0,60)}`).join('\n')+(records.length>list.length?`\n\n还有 ${records.length-list.length} 条同名客户的询盘没列出，可以说“打开询盘 编号”精确打开。`:'')+'\n\n客户资料只在 CRM 内显示，没有发送给外部模型。',actions};
}

// Catalogue pages: private page images in agent-private-knowledge/catalog-pages/, opened through a
// short-lived signed link (10 minutes). Requires the model code to be found in the catalogue extract.
export const CATALOG_PAGE_PREFIX='catalog-pages/';
// Catalogue requests also accept 下载/翻看 and "pdf" ("给我零售画册 PDF"); list questions stay with catalogue knowledge.
const CATALOG_VERB=/打开|调出|调取|弹出|跳转|开一下|新窗口|浏览器|下载|翻看|翻一下|pdf/i;
export function catalogPageIntent(question){const q=String(question||'');return CATALOG_VERB.test(q)&&/画册|产品页|型号页|目录页|catalog/i.test(q)}
export function catalogPagePath(catalog,page){return /^c[1-4]$/.test(catalog)&&Number.isInteger(page)&&page>0&&page<1000?`${CATALOG_PAGE_PREFIX}${catalog}_p${String(page).padStart(3,'0')}.jpg`:null}
const CATALOG_FILE={c1:'Project-Solutions',c2:'Retail-Catalogue',c3:'Soundproof-Wooden-Doors',c4:'True-Smart-Locks'};
export const CATALOG_TITLES={c1:'工程画册',c2:'零售画册',c3:'静音木门画册',c4:'真智能锁画册'};
const CATALOG_WORDS=[['c1',/工程画册|项目画册|工程方案画册|project solutions/i],['c2',/零售画册|零售产品画册|retail/i],['c3',/木门画册|静音木门|soundproof/i],['c4',/智能锁画册|真智能锁|smart locks? catalog/i]];
export function catalogNameIntent(question){const q=String(question||'');return CATALOG_VERB.test(q)?CATALOG_WORDS.find(([,re])=>re.test(q))?.[0]||null:null}
// Opening a catalogue returns a viewer action; the browser then asks for short-lived page links (catalog-pages).
export async function catalogPageActions(models,catalog){
 const norm=s=>String(s||'').toUpperCase().replace(/[\s\-_/]+/g,'');const seen=new Set(),out=[];
 for(const m of models)for(const p of catalog.products.filter(p=>p.model&&norm(p.model)===norm(m))){
  if(!catalogPagePath(p.catalog,p.page)||seen.has(p.catalog+p.page))continue;seen.add(p.catalog+p.page);
  const total=catalog.sources?.find(s=>s.id===p.catalog)?.pages||null;
  out.push({type:'catalog_view',catalog:p.catalog,page:p.page,pages:total,label:`${p.model} · ${CATALOG_TITLES[p.catalog]} 第${p.page}页`});
  if(out.length>=4)return out;
 }
 return out;
}
// The catalogue PDFs live in the material library; Grace downloads the original from there (owner 2026-10-01)
// instead of keeping copies in Supabase. Picks the best-matching current PDF; null when nothing clearly matches.
const CATALOG_MATCH={c1:/工程|project\s*solution/i,c2:/零售|retail/i,c3:/木门|soundproof|wooden/i,c4:/智能锁|smart\s*lock/i};
export const CATALOG_QUERIES={c1:['海外工程画册','Project Solutions'],c2:['海外零售画册','Retail Product Catalogue'],c3:['静音木门画册','Soundproof Wooden Doors'],c4:['智能锁画册','True Smart Locks']};
export function pickCatalogAsset(catalogId,assets){
 const re=CATALOG_MATCH[catalogId];if(!re)return null;
 const scored=(Array.isArray(assets)?assets:[]).map(a=>{const name=String(a?.name||''),where=name+' '+String(a?.relativePath||'');
  if(!a?.id||!/\.pdf$/i.test(name)||!re.test(where)||!/画册|catalog|catalogue|brochure|project\s*solutions|wooden\s*doors|smart\s*locks/i.test(where))return null;
  return {a,score:(a.isCurrentVersion?4:0)+(/2026/.test(where)?2:0)+(/海外|overseas|global/i.test(where)?1:0)+(/2026[-.]?0?8|8月|aug/i.test(where)?1:0)};}).filter(Boolean).sort((x,y)=>y.score-x.score);
 return scored[0]?{id:String(scored[0].a.id),name:String(scored[0].a.name).slice(0,200)}:null;
}
export function catalogPagesRequest(input,catalog){
 if(!/^c[1-4]$/.test(input?.catalog||''))throw Error('画册无效');
 const total=Number(catalog?.sources?.find(s=>s.id===input.catalog)?.pages);if(!Number.isInteger(total)||total<1||total>200)throw Error('画册页数未知');
 return {catalog:input.catalog,title:CATALOG_TITLES[input.catalog],paths:Array.from({length:total},(_,i)=>catalogPagePath(input.catalog,i+1)),pdfPath:`catalog-pdf/${input.catalog}.pdf`,pdfName:`WONLY-${CATALOG_FILE[input.catalog]}-2026-08.pdf`};
}
