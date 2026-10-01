// Continuous competitor watch (owner, 2026-10-01). Reads only the tracked competitors' OFFICIAL websites
// (hosts taken from the evidence file): their news/press lists, and the pages behind each evidence quote to
// spot changed or removed claims. Results are candidates for a person to read, never verified facts.
// No CRM data is involved; the only external model call translates public headline text to Chinese.
const MAX_BYTES=2*1024*1024;
export const NEWSY=/news|press|media|release|newsroom|noticias|prensa|blog|articles?|insights|stories|events|新闻|动态|资讯/i;
const decode=s=>String(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&rsquo;|&lsquo;/g,"'").replace(/&quot;|&ldquo;|&rdquo;/g,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/\s+/g,' ').trim();
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return ''}};
const sameSite=(a,b)=>{const x=host(a),y=host(b);return !!x&&!!y&&(x===y||x.endsWith('.'+y)||y.endsWith('.'+x))};

// Companies to watch, with their official hosts and evidence pages.
export function watchList(evidence){
 const map=new Map();
 for(const e of evidence){let u;try{u=new URL(e.source_url)}catch{continue}if(u.protocol!=='https:')continue;
  const c=map.get(e.company)||{company:e.company,origins:new Set(),evidence:[]};c.origins.add(u.origin);c.evidence.push(e);map.set(e.company,c)}
 return [...map.values()].map(c=>({...c,origins:[...c.origins].slice(0,2)}));
}
export function rotate(list,offset,size){if(!list.length)return [];const out=[];for(let i=0;i<Math.min(size,list.length);i++)out.push(list[(offset+i)%list.length]);return out}

const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,ene:1,abr:4,ago:8,dic:12};
function iso(y,m,d){const s=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return Number(m)>=1&&Number(m)<=12&&Number(d)>=1&&Number(d)<=31&&Number.isFinite(Date.parse(s))?s:null}
export function findDate(t){
 let m=String(t).match(/\b(20\d{2})[-./年](\d{1,2})[-./月](\d{1,2})/);if(m)return iso(m[1],m[2],m[3]);
 m=String(t).match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);if(m&&MONTHS[m[2].slice(0,3).toLowerCase()])return iso(m[3],MONTHS[m[2].slice(0,3).toLowerCase()],m[1]);
 m=String(t).match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/);if(m&&MONTHS[m[1].slice(0,3).toLowerCase()])return iso(m[3],MONTHS[m[1].slice(0,3).toLowerCase()],m[2]);
 return null;
}
// News-list pages linked from a homepage (same site, path looks like news/press).
export function newsPages(html,pageUrl,limit=2){
 const out=[];const re=/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi;let m;
 while((m=re.exec(html))&&out.length<limit){let u;try{u=new URL(m[1],pageUrl)}catch{continue}
  if(u.protocol!=='https:'||!sameSite(u.href,pageUrl)||!NEWSY.test(u.pathname)||u.pathname.split('/').filter(Boolean).length>3)continue;
  u.search='';u.hash='';if(!out.includes(u.href))out.push(u.href)}
 return out;
}
// Headline links on a news-list page.
export function headlines(html,pageUrl,limit=10){
 const out=[],seen=new Set();const re=/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
 while((m=re.exec(html))&&out.length<limit){let u;try{u=new URL(m[1],pageUrl)}catch{continue}
  if(u.protocol!=='https:'||!sameSite(u.href,pageUrl))continue;
  const title=decode(m[2]);if(title.length<18||title.length>200||/^(read more|more|leer más|ver más|learn more|查看更多|了解更多)$/i.test(title)||CTA.test(title))continue;
  if(!NEWSY.test(u.pathname)&&!/\/20\d{2}\//.test(u.pathname))continue;
  u.hash='';u.search='';if(u.pathname.replace(/\/$/,'')===new URL(pageUrl).pathname.replace(/\/$/,'')||seen.has(u.href))continue;seen.add(u.href);
  const near=decode(html.slice(Math.max(0,m.index-160),Math.min(html.length,re.lastIndex+160)));
  const published_on=findDate(title)||findDate(near),slug=decodeURIComponent(u.pathname.split('/').filter(Boolean).at(-1)||'');
  // A real article has a date or a descriptive slug; menu links like /news/events are skipped.
  if(!published_on&&slug.split(/[-_]+/).filter(w=>w.length>1).length<3)continue;
  out.push({title,url:u.href,published_on});
 }
 return out;
}
const CTA=/order now|free sample|subscribe|sign up|register|contact us|download (the )?(brochure|catalog)|book a|get a quote|events? (and|&) announcements|立即|免费订购|联系我们|订阅/i;
const norm=s=>decode(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
// Is the evidence quote still on its page? Uses the first 60 meaningful characters.
export function quoteStillThere(html,quote){const q=norm(quote).slice(0,60);return q.length<8||norm(html).includes(q)}

async function getPage(url,fetcher){
 const r=await fetcher(url,{redirect:'follow',headers:{'user-agent':'WONLY-competitor-watch/1.0 (official public pages only)','accept-language':'en,zh;q=0.8,es;q=0.6'},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('HTTP '+r.status);if(r.url&&!sameSite(r.url,url))throw Error('redirected off site');
 const type=String(r.headers?.get?.('content-type')||'text/html');const buf=new Uint8Array(await r.arrayBuffer());if(buf.length>MAX_BYTES)throw Error('too large');return {type,html:new TextDecoder().decode(buf)};
}
async function getText(url,fetcher){
 const r=await fetcher(url,{redirect:'follow',headers:{'user-agent':'WONLY-competitor-watch/1.0 (official public pages only)','accept-language':'en,zh;q=0.8,es;q=0.6'},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('HTTP '+r.status);if(r.url&&!sameSite(r.url,url))throw Error('redirected off site');
 const buf=new Uint8Array(await r.arrayBuffer());if(buf.length>MAX_BYTES)throw Error('too large');return new TextDecoder().decode(buf);
}
// ---- YouTube: channels found on the competitor's own website; new uploads read from the public RSS feed.
const YT='https://www.youtube.com';
export function youtubeLinks(html){
 const out=[],seen=new Set();const re=/https?:\/\/(?:www\.|m\.)?youtube\.com\/(channel\/(UC[\w-]{22})|@([\w.-]{3,40})|c\/([\w.-]{2,60})|user\/([\w.-]{2,60}))/gi;let m;
 while((m=re.exec(html))&&out.length<3){const link=m[2]?{type:'channel',value:m[2]}:m[3]?{type:'handle',value:m[3]}:m[4]?{type:'c',value:m[4]}:{type:'user',value:m[5]};
  const k=link.type+':'+link.value.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(link)}}
 return out;
}
export function channelIdFromPage(html){const m=String(html).match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/)||String(html).match(/youtube\.com\/channel\/(UC[\w-]{22})/);return m?m[1]:null}
async function ytText(url,fetcher){const r=await fetcher(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; WONLY-competitor-watch/1.0)','accept-language':'en'},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('HTTP '+r.status);if(r.url&&!/^https:\/\/(www\.)?youtube\.com\//.test(r.url))throw Error('off youtube');const buf=new Uint8Array(await r.arrayBuffer());if(buf.length>MAX_BYTES*2)throw Error('too large');return new TextDecoder().decode(buf)}
export async function resolveChannel(link,fetcher){
 if(link.type==='channel')return link.value;
 const path=link.type==='handle'?'/@'+encodeURIComponent(link.value):'/'+link.type+'/'+encodeURIComponent(link.value);
 return channelIdFromPage(await ytText(YT+path,fetcher));
}
const unxml=s=>String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
export function parseFeed(xml){
 return [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([,e])=>{const id=e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];const title=unxml(e.match(/<title>([\s\S]*?)<\/title>/)?.[1]||'');const pub=e.match(/<published>(\d{4}-\d{2}-\d{2})/)?.[1]||null;
  return id&&title?{title:title.slice(0,300),url:'https://www.youtube.com/watch?v='+id,published_on:pub}:null}).filter(Boolean).slice(0,15);
}
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k]).catch(e=>({error:String(e?.message||e)}))}}));return out}

// One watch pass over a slice of companies and evidence pages. Returns new items (not yet stored).
export async function runWatch({evidence,known,offset=0,companies=20,evidenceChecks=40,channels=new Map(),fetcher=fetch,now=Date.now()}){
 const list=watchList(evidence),slice=rotate(list,offset,companies),items=[],newChannels=[];let ok=0,failed=0;
 await pool(slice,6,async c=>{
  let found=false;
  for(const origin of c.origins){
   try{const home=await getText(origin+'/',fetcher);ok++;
    if(!channels.has(c.company))for(const link of youtubeLinks(home)){try{const id=await resolveChannel(link,fetcher);if(id){channels.set(c.company,id);newChannels.push({company:c.company,channel_id:id});break}}catch{}}
    for(const page of newsPages(home,origin+'/')){try{const html=await getText(page,fetcher);
      for(const h of headlines(html,page))if(!known.has('news|'+h.url)&&(!h.published_on||now-Date.parse(h.published_on)<=60*864e5)){items.push({company:c.company,kind:'news',...h});known.add('news|'+h.url)}found=true}catch{failed++}}
   }catch{failed++}
   if(found)break;
  }
 });
 let videosRead=0;
 await pool([...channels],6,async([company,id])=>{try{const feed=parseFeed(await ytText(YT+'/feeds/videos.xml?channel_id='+encodeURIComponent(id),fetcher));videosRead++;
  for(const v of feed)if(!known.has('video|'+v.url)&&(!v.published_on||now-Date.parse(v.published_on)<=60*864e5)){items.push({company,kind:'video',...v});known.add('video|'+v.url)}}catch{}});
 const pages=rotate(evidence,offset*2,evidenceChecks);let checked=0;
 await pool(pages,6,async e=>{try{if(/\.pdf($|\?)/i.test(e.source_url))return;const {type,html}=await getPage(e.source_url,fetcher);
  // Only server-rendered HTML with real text can be checked; PDFs and script-built pages are skipped, not flagged.
  if(!/html/i.test(type)||decode(html).length<800)return;checked++;
  if(!quoteStillThere(html,e.quote)&&!known.has('evidence_changed|'+e.source_url)){items.push({company:e.company,kind:'evidence_changed',title:`官方页面上已找不到这条原文：${e.value}`.slice(0,300),url:e.source_url,published_on:null,evidence_id:e.id});known.add('evidence_changed|'+e.source_url)}}catch{}});
 return {items:items.slice(0,120),sourcesOk:ok,sourcesFailed:failed,evidenceChecked:checked,channelsRead:videosRead,newChannels,nextOffset:(offset+companies)%Math.max(1,list.length)};
}

// Chinese gist of public headline text (best effort; original title is always kept).
export function translateBody(titles){return {model:'qwen-plus',messages:[{role:'system',content:'把下面每条公开新闻标题翻译成简洁中文，保留品牌和型号原文。只返回JSON数组，元素顺序与输入一致，不添加内容。'},{role:'user',content:JSON.stringify(titles)}],temperature:0.1,max_tokens:1500}}
export function readTranslations(payload,n){try{const t=payload?.choices?.[0]?.message?.content||'';const arr=JSON.parse(t.slice(t.indexOf('['),t.lastIndexOf(']')+1));return Array.isArray(arr)&&arr.length===n?arr.map(x=>String(x).slice(0,300)):null}catch{return null}}

// Grace's report.
export function intelIntent(question){
 const q=String(question||'');
 if(/刷新|更新|重新巡检|马上查/.test(q)&&/竞品|情报|对手/.test(q))return {refresh:true};
 const rival=/竞品|竞争对手|对手|同行/.test(q);
 if(rival&&MARKETING_Q.test(q))return {refresh:false,focus:'marketing'};
 return /(竞品|竞争对手|对手|同行).{0,10}(动态|新闻|最新|情报|消息|发布|变化|汇报)|(竞品|竞争)情报|情报汇报|汇报.{0,4}竞品/.test(q)?{refresh:false}:null;
}
// Owner 2026-10-01: "最近竞品有哪些重大的营销活动" -> marketing view of the same watch results.
const MARKETING_Q=/营销|市场活动|推广|促销|打折|广告|展会|展览|发布会|新品|活动|campaign/i;
export const MARKETING_ITEM=/展会|展览|博览|参展|expo|exhibit|feria|fair|big ?5|intersec|batimat|bau\b|launch|发布|新品|nuevo|nueva|lanza|\bpresenta\b|promo|促销|折扣|descuento|oferta|sale\b|campaign|活动|event|evento|award|获奖|奖|webinar|sponsor|赞助|partner|合作|showroom|展厅|开业|inaugur|\bnew\b|alliance|\bmou\b|signs?\b.{0,30}(deal|agreement)|collezione|collection|colección|talks|podcast|security month|certificate|شهادة/i;
// Off-topic consumer lines that share a brand with a door/lock competitor (phones, coffee machines, power tools).
export const OFF_TOPIC=/espresso|إسبريسو|قهوة|coffee|スマホ|エアフライヤー|掃除機|空気清浄機|家電|REDMI|FUJIWARA|smartphone|rotomartillo|traspaleta|prensa de|extractor|surtek/i;
export function intelAnswer(report,{days=14,focus=null}={}){
 if(focus==='marketing')return marketingAnswer(report,days);
 const run=report?.last_run,items=Array.isArray(report?.items)?report.items:[];
 const when=run?new Date(run.started_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):null;
 const head=run?`竞品巡检：最近一次 ${when}（读取官方网站 ${run.sources_ok} 个、失败 ${run.sources_failed} 个，核对证据页面 ${run.evidence_checked} 个${run.channels_known!=null?`，跟踪 YouTube 频道 ${run.channels_known} 个`:''}）。每 4 小时自动巡检一次，看各公司官网和官网上挂的 YouTube 频道。`:'竞品巡检还没有运行过：上线后每 4 小时自动跑一次，也可以说“刷新竞品情报”立刻跑。';
 if(!items.length)return head+`\n\n近 ${days} 天没有发现新的官网动态或证据变化。官网没有发新闻不代表对方没有动作，社媒和展会消息不在巡检范围内。`;
 const news=items.filter(i=>i.kind==='news'),changed=items.filter(i=>i.kind==='evidence_changed'),videos=items.filter(i=>i.kind==='video');
 const by=new Map();for(const n of news){const k=n.company;by.set(k,[...(by.get(k)||[]),n])}
 const lines=[...by].slice(0,12).map(([c,v])=>`■ ${c}\n`+v.slice(0,4).map(n=>`  ${n.published_on||'日期未标'}｜${n.title_zh?n.title_zh+'（原文：'+n.title+'）':n.title}\n  ${n.url}`).join('\n'));
 return head+`\n\n近 ${days} 天官网新动态 ${news.length} 条`+(news.length?`：\n`+lines.join('\n'):'。')+
  (videos.length?`\n\nYouTube 新视频 ${videos.length} 条：\n`+videos.slice(0,10).map(v=>`  ${v.published_on||''}｜${v.company}｜${v.title_zh?v.title_zh+'（原文：'+v.title+'）':v.title}\n  ${v.url}`).join('\n'):'')+
  (changed.length?`\n\n证据变化 ${changed.length} 条（官网上已找不到之前收录的原文，可能是改版或参数调整，需要人工打开确认）：\n`+changed.slice(0,8).map(c=>`  ${c.company}｜${c.title}\n  ${c.url}`).join('\n'):'')+
  '\n\n以上是官网标题级候选，还没有人工核验；中文是机器翻译，以原文为准。需要深入哪一家，直接说公司名。';
}

// Heavier signals: trade shows, deals/alliances, launches of a new range. Ranked before everyday content.
export const MAJOR_ITEM=/展会|展览|博览|参展|expo|exhibit|feria|fair\b|big ?5|intersec|batimat|\bmou\b|alliance|deal|agreement|award|获奖|sponsor|赞助|开业|inaugur|launch|新品|new .{0,25}(range|line|collection|series)|collezione|colección|certificate|شهادة/i;
const seriesKey=title=>String(title).replace(/\s*[-–|]?\s*(EP\.?|episodio|episode|ep)\s*\d+.*$/i,'').trim();
function marketingAnswer(report,days){
 const run=report?.last_run,items=(Array.isArray(report?.items)?report.items:[]).filter(i=>i.kind!=='evidence_changed');
 const t=i=>`${i.title} ${i.title_zh||''}`;
 const relevant=items.filter(i=>!OFF_TOPIC.test(t(i))),hits=relevant.filter(i=>MARKETING_ITEM.test(t(i))),rest=relevant.length-hits.length,off=items.length-relevant.length;
 const when=run?new Date(run.started_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):null;
 const head=`近 ${days} 天竞品营销动作（从竞品官网新闻和官方 YouTube 频道里挑出展会、签约合作、新品发布、促销、内容栏目类标题${when?'；最近一次巡检 '+when:''}）：`;
 const scope='\n\n范围说明：只看得到对方官网和 YouTube 上自己公布的内容；Facebook/Instagram/TikTok/LinkedIn 广告投放、线下促销和海关出货量目前不在巡检范围，要接公司在用的第三方工具才能看到。标题级候选，未人工核验，中文为机器翻译。';
 if(!items.length)return (run?head+'\n\n这段时间官网和 YouTube 都没有新内容。':'竞品巡检还没有运行过，可以说“刷新竞品情报”立刻跑一轮。')+scope;
 if(!hits.length)return head+`\n\n没有找到明显的营销活动类标题（共 ${relevant.length} 条相关新内容，多为产品介绍或公司新闻）。说“汇报竞品动态”可以看全部。`+scope;
 const label=i=>`${i.published_on||'日期未标'}｜${i.kind==='video'?'[视频] ':''}${i.title_zh?i.title_zh+'（原文：'+i.title+'）':i.title}\n    ${i.url}`;
 // Collapse episodic series (podcasts, "EP. 24/25/26…") into one line per company.
 const groups=new Map();
 for(const i of hits){const k=i.company+'|'+seriesKey(i.title);groups.set(k,[...(groups.get(k)||[]),i])}
 const entries=[...groups.values()].map(v=>({company:v[0].company,major:v.some(i=>MAJOR_ITEM.test(t(i))),text:v.length>1?`${v.map(i=>i.published_on).filter(Boolean).sort()[0]||''}起｜${v[0].kind==='video'?'[视频] ':''}${seriesKey(v[0].title)} 系列，共 ${v.length} 期（持续做内容栏目）\n    ${v[0].url}`:label(v[0])}));
 const major=entries.filter(e=>e.major),other=entries.filter(e=>!e.major);
 const block=list=>{const by=new Map();for(const e of list)by.set(e.company,[...(by.get(e.company)||[]),e.text]);return [...by].sort((a,b)=>b[1].length-a[1].length).slice(0,8).map(([c,v])=>`■ ${c}\n`+v.slice(0,5).map(x=>'  · '+x).join('\n')).join('\n')};
 return head+
  (major.length?`\n\n【重点：展会 / 签约合作 / 新品系列】\n`+block(major):'\n\n没有发现展会、签约或新品发布类动作。')+
  (other.length?`\n\n【其他营销内容】\n`+block(other):'')+
  (rest?`\n\n另有 ${rest} 条一般动态没列出，说“汇报竞品动态”看全部。`:'')+(off?`（已略过 ${off} 条与门锁无关的内容，如同品牌的手机、咖啡机、电动工具）`:'')+
  (hits.some(i=>!i.published_on)?'\n\n注意：“日期未标”是对方官网没写日期，这类条目是巡检近期第一次看到，不一定是近期发生的（比如展会可能是年初的）。':'')+'\n\n“重大”是按展会、签约、新品这类动作归的，不代表我判断了影响大小；需要深挖哪家，直接说公司名。'+scope;
}
