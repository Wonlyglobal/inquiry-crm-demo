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
 return /(竞品|竞争对手|对手|同行).{0,10}(动态|新闻|最新|情报|消息|发布|变化|汇报)|(竞品|竞争)情报|情报汇报|汇报.{0,4}竞品/.test(q)?{refresh:false}:null;
}
export function intelAnswer(report,{days=14}={}){
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
