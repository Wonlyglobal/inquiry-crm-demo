#!/usr/bin/env node
// Daily public-intel watch, run by GitHub Actions (replaces the local Codex heartbeat's source check).
// Reads only the fixed official source list in data/agent-intelligence.json, extracts headline-level
// candidates (title + link + date if printed nearby) and writes a Markdown report for a GitHub issue.
// Candidates are NOT verified facts: a person reviews them and only verified items enter the feed.
// No CRM data, customer data, secrets or model calls are involved.
import {readFileSync,writeFileSync} from 'node:fs';

const MAX_BYTES=2*1024*1024,MAX_PER_SOURCE=8,RECENT_DAYS=14;
const NEWSY=/news|press|media|release|newsroom|noticias|blog|articles?|insights|stories/i;
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12,ene:1,abr:4,ago:8,dic:12};
const decode=s=>s.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&rsquo;|&lsquo;/g,"'").replace(/&quot;|&ldquo;|&rdquo;/g,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/\s+/g,' ').trim();

const mon=w=>MONTHS[String(w).slice(0,4).toLowerCase()]??MONTHS[String(w).slice(0,3).toLowerCase()];
export function findDate(text){
 let m=text.match(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/);if(m)return iso(m[1],m[2],m[3]);
 m=text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);if(m&&mon(m[2]))return iso(m[3],mon(m[2]),m[1]);
 m=text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/);if(m&&mon(m[1]))return iso(m[3],mon(m[1]),m[2]);
 return null;
}
// Nearest printed date to the link: scan decoded text before and after, prefer the closest one.
export function nearestDate(before,after){
 const pat=/\b20\d{2}[-./]\d{1,2}[-./]\d{1,2}\b|\b\d{1,2}\s+[A-Za-z]{3,9}\.?\s+20\d{2}\b|\b[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+20\d{2}\b/g;
 const found=[];
 for(const m of before.matchAll(pat)){const d=findDate(m[0]);if(d)found.push({d,dist:before.length-(m.index+m[0].length)})}
 for(const m of after.matchAll(pat)){const d=findDate(m[0]);if(d)found.push({d,dist:m.index})}
 return found.sort((a,b)=>a.dist-b.dist)[0]?.d||null;
}
function iso(y,mo,d){const s=`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return Number.isFinite(Date.parse(s))&&Number(mo)<=12&&Number(d)<=31?s:null}

export function extractCandidates(html,pageUrl){
 const base=new URL(pageUrl),out=[],seen=new Set();
 const re=/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
 while((m=re.exec(html))&&out.length<60){
  let url;try{url=new URL(m[1],base)}catch{continue}
  if(url.protocol!=='https:'||url.hostname.replace(/^www\./,'')!==base.hostname.replace(/^www\./,''))continue;
  if(!NEWSY.test(url.pathname)||url.pathname.replace(/\/$/,'')===base.pathname.replace(/\/$/,''))continue;
  const title=decode(m[2]);if(title.length<20||title.length>200||/^(read more|more|leer más|ver más)$/i.test(title))continue;
  url.hash='';url.search='';const key=url.href;if(seen.has(key))continue;seen.add(key);
  const before=decode(html.slice(Math.max(0,m.index-200),m.index)),after=decode(html.slice(re.lastIndex,Math.min(html.length,re.lastIndex+200)));
  out.push({title,url:key,date:findDate(title)||nearestDate(before,after)});
 }
 return out;
}

export function selectNew(cands,knownUrls,now=Date.now()){
 return cands.filter(c=>!knownUrls.has(c.url)).filter(c=>!c.date||now-Date.parse(c.date)<=RECENT_DAYS*864e5).slice(0,MAX_PER_SOURCE);
}

export function report(results,now=new Date()){
 const lines=[`# 公开情报候选 ${now.toISOString().slice(0,10)}`,'','由 GitHub Actions 每日运行，只读取固定官方来源的新闻列表，提取标题级候选。**候选不是已核验事实**：请人工打开原文确认后，再加入 data/agent-intelligence.json；没有新候选不代表来源没有变化。','','## 来源状态',''];
 for(const r of results)lines.push(`- ${r.name}：${r.status==='ok'?`已读取（发现 ${r.found} 条链接，新候选 ${r.fresh.length} 条）`:r.status==='empty'?'已读取，但未识别到新闻链接（页面可能由脚本动态加载）':`读取失败（${r.error}）`} ${r.url}`);
 const fresh=results.flatMap(r=>r.fresh.map(c=>({...c,source:r.name})));
 lines.push('','## 新候选','');
 if(!fresh.length)lines.push('本次没有新的候选标题。');
 for(const c of fresh)lines.push(`- [ ] ${c.date||'日期未识别'}｜${c.source}｜[${c.title.replace(/[[\]]/g,'')}](${c.url})`);
 return {markdown:lines.join('\n')+'\n',fresh:fresh.length,failed:results.filter(r=>r.status==='failed').length};
}

async function main(){
 const feed=JSON.parse(readFileSync(new URL('../data/agent-intelligence.json',import.meta.url)));
 const known=new Set((feed.findings||[]).map(f=>f.url));const results=[];
 for(const s of feed.sources||[]){
  let url;try{url=new URL(s.url)}catch{continue}if(url.protocol!=='https:')continue;
  try{
   const r=await fetch(url.href,{redirect:'follow',headers:{'user-agent':'WONLY-intel-watch/1.0 (+public official news only)'},signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error('HTTP '+r.status);const buf=new Uint8Array(await r.arrayBuffer());if(buf.length>MAX_BYTES)throw Error('页面过大');
   const cands=extractCandidates(new TextDecoder().decode(buf),r.url||url.href);
   results.push({name:s.name,url:url.href,status:cands.length?'ok':'empty',found:cands.length,fresh:selectNew(cands,known)});
  }catch(e){results.push({name:s.name,url:url.href,status:'failed',error:String(e.message||e.name).slice(0,80),found:0,fresh:[]})}
 }
 const out=report(results);writeFileSync(process.argv[2]||'intel-report.md',out.markdown);
 console.log(JSON.stringify({fresh:out.fresh,failed:out.failed,sources:results.length}));
}
if(import.meta.url===`file://${process.argv[1]}`)main().catch(e=>{console.error(e.message);process.exit(1)});
