// Grace request timeline (owner, 2026-09-28): every request runs as a small pipeline on the Grace page -
// 听懂需求 → 调取资料 → 执行动作 → 给出回答 - and every resource or action opens as a window inside that
// step (catalogue pages, CRM pages, inquiry details, competitor evidence, search results, materials).
// Nothing opens a new browser window. History is kept in a private CRM table (descriptors only).
import {openCatalogViewer} from './agent-catalog-viewer.mjs?v=20260928-tl1';

export const STAGES=[['need','听懂需求'],['data','调取资料'],['act','执行动作'],['answer','给出回答']];
const ROUTES={conversation:'对话',materials:'物料库',general:'通用知识',research:'公开资料',catalog:'海外画册',actions:'CRM 页面与动作',memory:'长期记忆',feedback:'回答反馈',corrections:'纠错知识',company:'背调系统',competitor:'竞品证据',crm_local:'CRM 本地统计',intelligence:'智能体情报简报'};
const KIND_LABEL={catalog:'画册',crm_view:'CRM 页面',crm_record:'询盘详情',evidence:'竞品证据',search:'搜索结果',material:'物料',link:'链接'};
const CSS=`.gt{display:flex;flex-direction:column;min-height:0;max-height:65vh;border:1px solid #ffffff20;border-radius:18px;background:#0d1524;color:#e5ebf5;font:13px/1.5 system-ui,sans-serif}
.gt-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #ffffff15}.gt-head strong{flex:1;font-size:15px;color:#f4e2bb}
.gt-head button,.gt button.gt-mini{background:#152035;color:#c9d3e4;border:1px solid #43516a;border-radius:8px;padding:2px 8px;font:inherit;cursor:pointer}
.gt-list{list-style:none;margin:0;padding:10px 12px 14px 26px;overflow:auto;position:relative}
.gt-empty{color:#8f9bb0;padding:14px;font-size:13px}
.gt-item{position:relative;margin:0 0 14px;padding:10px 12px;border:1px solid #2c3950;border-radius:12px;background:#111b2c}
.gt-item::before{content:'';position:absolute;left:-17px;top:16px;width:10px;height:10px;border-radius:50%;background:#64748b;box-shadow:0 0 0 3px #0d1524}
.gt-item::after{content:'';position:absolute;left:-13px;top:30px;bottom:-16px;width:2px;background:#26324a}
.gt-item:last-child::after{display:none}
.gt-item[data-status=running]::before{background:#f4c46b;animation:gtp 1.2s infinite}.gt-item[data-status=done]::before{background:#34d399}.gt-item[data-status=failed]::before{background:#f87171}
@keyframes gtp{50%{opacity:.35}}
.gt-top{display:flex;gap:8px;align-items:flex-start}.gt-time{color:#8f9bb0;font-size:12px;white-space:nowrap;padding-top:1px}
.gt-q{flex:1;min-width:0;font-weight:600;color:#eef2f9;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.gt-stages{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:8px 0 2px}
.gt-stage{font-size:11px;padding:1px 7px;border-radius:10px;border:1px solid #334155;color:#8f9bb0}
.gt-stage[data-s=active]{border-color:#f4c46b;color:#f4c46b}.gt-stage[data-s=done]{border-color:#34d39966;color:#6ee7b7}.gt-stage[data-s=fail]{border-color:#f87171;color:#fca5a5}.gt-stage[data-s=skip]{opacity:.45}
.gt-arrow{color:#475569;font-size:10px}
.gt-src{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.gt-src span{font-size:11px;background:#1b2740;color:#b8c4d8;border-radius:6px;padding:0 6px}
.gt-err{color:#fca5a5;font-size:12px;margin-top:6px}
.gt-win{margin-top:8px;border:1px solid #2c3950;border-radius:10px;background:#0b1320;overflow:hidden}
.gt-win>summary{display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;font-size:12px;color:#c9d3e4;list-style:none}
.gt-win>summary::-webkit-details-marker{display:none}.gt-win>summary b{color:#f4e2bb;font-weight:600;white-space:nowrap}
.gt-win>summary span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gt-body{padding:8px}.gt-body iframe{width:100%;height:420px;border:0;border-radius:8px;background:#fff;display:block}
.gt-win.gt-big{position:fixed;inset:12px;z-index:9998;margin:0;display:flex;flex-direction:column;box-shadow:0 10px 40px #000a}
.gt-win.gt-big .gt-body{flex:1;overflow:auto}.gt-win.gt-big .gt-body iframe{height:100%;min-height:70vh}
.gt-card blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid #f4c46b;background:#131d30;color:#e5ebf5;font-style:italic;overflow-wrap:anywhere}
.gt-card .gt-meta,.gt-note{color:#8f9bb0;font-size:12px}.gt a{color:#93c5fd;overflow-wrap:anywhere}
.gt-results{margin:6px 0 0;padding-left:18px}.gt-results li{margin:3px 0}
.gt-summary{white-space:pre-wrap;max-height:220px;overflow:auto;color:#dbe3ef}
.gt .acv{margin:0}.gt .acv .acv-stage{height:260px}.gt .acv .acv-bar button:last-child{display:none}`;

const two=n=>String(n).padStart(2,'0');
export function timeLabel(iso,now=new Date()){const d=new Date(iso);if(Number.isNaN(+d))return '';const hm=two(d.getHours())+':'+two(d.getMinutes());return d.toDateString()===now.toDateString()?hm:`${d.getMonth()+1}/${d.getDate()} ${hm}`}
const safeHttps=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:null}catch{return null}};

// Answer → source labels shown on the "调取资料" step.
export function sourceLabels(result){
 const out=[],route=result?.context?.route;
 if(route&&ROUTES[route])out.push(ROUTES[route]);else if(result?.provider==='bailian')out.push('CRM 脱敏汇总');
 for(const l of Array.isArray(result?.context?.labels)?result.context.labels:[])if(typeof l==='string'&&l)out.push(l.slice(0,20));
 if(result?.context?.seo_status||result?.context?.seo)out.push('官网 SEO');
 if(result?.context?.social_status||result?.context?.social)out.push('社媒');
 if(Array.isArray(result?.materials)&&result.materials.length)out.push(`物料 ${result.materials.length} 份`);
 if(Array.isArray(result?.sources)&&result.sources.length)out.push(`联网来源 ${result.sources.length} 条`);
 return [...new Set(out)].slice(0,6);
}
// Answer → window descriptors (what gets rendered now and stored for history).
export function windowsFrom(result){
 const w=[];
 for(const a of Array.isArray(result?.actions)?result.actions:[]){
  if(a?.type==='catalog_view'&&/^c[1-4]$/.test(a.catalog||''))w.push({kind:'catalog',catalog:a.catalog,page:Number.isInteger(a.page)?a.page:1,label:String(a.label||'画册')});
  else if(a?.type==='crm_view'&&/^[a-z0-9-]{2,40}$/.test(a.view||''))w.push({kind:'crm_view',view:a.view,label:String(a.label||a.view)});
  else if(a?.type==='crm_record'&&/^[0-9a-f-]{36}$/i.test(a.id||''))w.push({kind:'crm_record',id:a.id,label:String(a.label||'询盘')});
  else if(a?.type==='evidence'&&a.id)w.push({kind:'evidence',id:a.id,card:a});
  else if(a?.type==='web_search'&&a.query)w.push({kind:'search',query:String(a.query),sources:[]});
  else if(safeHttps(a?.url))w.push({kind:'link',url:safeHttps(a.url),label:String(a.label||a.url)});
 }
 for(const m of Array.isArray(result?.materials)?result.materials:[])if(m?.id)w.push({kind:'material',id:m.id,name:String(m.name||'物料'),asset:m});
 if(Array.isArray(result?.sources)&&result.sources.length)w.push({kind:'search',query:'回答引用的联网来源',sources:result.sources.map(s=>({title:String(s.title||s.url),url:s.url})).filter(s=>safeHttps(s.url)).slice(0,8)});
 return w.slice(0,8);
}
// What is stored: no signed links, card bodies or material objects.
export function storable(w){const {card,asset,...rest}=w;return rest.kind==='link'?null:rest}

export function createTimeline(root,{call,getPersona,materialRow,origin=location.origin,doc=document,win=window}){
 if(!doc.getElementById('gt-style')){const st=doc.createElement('style');st.id='gt-style';st.textContent=CSS;doc.head.append(st)}
 const mk=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
 const box=mk('section','gt');box.setAttribute('aria-label','需求时间线');
 const head=mk('div','gt-head'),title=mk('strong','','需求时间线'),count=mk('span','gt-note',''),clear=mk('button','','清空');clear.type='button';
 head.append(title,count,clear);const list=mk('ol','gt-list');const empty=mk('div','gt-empty','你提的每个需求都会按时间排在这里：用了哪些资料、打开了什么，都在对应的小窗口里，不会另开浏览器。');
 box.append(head,empty,list);root.replaceChildren(box);
 let armed=null;
 const refresh=()=>{const n=list.children.length;count.textContent=n?`${n} 条`:'';empty.hidden=n>0;clear.hidden=!n};
 clear.onclick=async()=>{if(!armed){clear.textContent='确认清空';armed=setTimeout(()=>{armed=null;clear.textContent='清空'},5000);return}clearTimeout(armed);armed=null;clear.textContent='清空';try{await call({action:'timeline',op:'delete',id:null});list.replaceChildren();refresh()}catch(e){count.textContent=e.message}};

 async function render(w,body,item){
  const persona=getPersona();
  if(w.kind==='catalog'){const d=await call({action:'catalog-pages',persona,catalog:w.catalog});openCatalogViewer({title:String(d?.title||w.label),urls:Array.isArray(d?.urls)?d.urls:[],pdf:d?.pdf||null,start:w.page||1,container:body,doc,win});return}
  if(w.kind==='crm_view'||w.kind==='crm_record'){
   const base=safeHttps(origin);if(!base)throw Error('页面地址无效');
   const f=mk('iframe');f.title=w.label||KIND_LABEL[w.kind];f.loading='lazy';f.referrerPolicy='same-origin';
   f.src=new URL('/?embed=1'+(w.kind==='crm_view'?'#view='+encodeURIComponent(w.view):'#inquiry/'+encodeURIComponent(w.id)),base).href;
   body.append(f,mk('div','gt-note','在这个小窗口里操作 CRM；点“放大”可以铺满页面。'));return}
  if(w.kind==='evidence'){const c=w.card;if(!c)throw Error('这条竞品证据已不在证据库');const card=mk('div','gt-card');
   card.append(mk('div','',`${c.company} · ${c.product}${c.market?'（'+c.market+'）':''}`));if(c.value)card.append(mk('div','',c.value));if(c.quote)card.append(mk('blockquote','',c.quote));
   const meta=mk('div','gt-meta',`官方资料 · 核验于 ${c.accessed||'未知'} · `);const url=safeHttps(c.url);if(url){const a=mk('a','','看原网页');a.href=url;a.target='_blank';a.rel='noopener noreferrer';meta.append(a)}card.append(meta);body.append(card);return}
  if(w.kind==='search'){
   if(!w.sources?.length){body.append(mk('div','gt-note','正在搜索…'));const d=await call({action:'web-search',persona,query:w.query});body.replaceChildren();w.sources=(d.sources||[]).filter(s=>safeHttps(s.url)).slice(0,8);
    if(d.summary){body.append(mk('div','gt-summary',String(d.summary).slice(0,1500)))}
    body.append(mk('div','gt-note',d.status==='available'?`搜索时间 ${timeLabel(d.checked_at)} · 搜索服务返回的来源，未逐页核验`:'这次没有取得可核对的来源，稍后可以再试。'))}
   if(w.sources?.length){const ol=mk('ol','gt-results');for(const s of w.sources){const li=mk('li');const a=mk('a','',s.title||s.url);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a);ol.append(li)}body.append(ol)}
   return}
  if(w.kind==='material'){const row=materialRow?.(w.asset||{id:w.id,name:w.name});if(row)body.append(row);else body.append(mk('div','',w.name));return}
  if(w.kind==='link'){const a=mk('a','',w.label);a.href=w.url;a.target='_blank';a.rel='noopener noreferrer';body.append(a);return}
 }
 function addWindow(item,w,{open=true}={}){
  const d=mk('details','gt-win');d.open=open;const sum=mk('summary');sum.append(mk('b','',KIND_LABEL[w.kind]||'窗口'),mk('span','',w.kind==='search'?w.query:w.kind==='evidence'?(w.card?.label||'竞品证据'):w.kind==='material'?w.name:(w.label||'')));
  const big=mk('button','gt-mini','放大');big.type='button';big.onclick=e=>{e.preventDefault();const on=!d.classList.contains('gt-big');d.classList.toggle('gt-big',on);big.textContent=on?'缩小':'放大';if(on)d.open=true};
  sum.append(big);const body=mk('div','gt-body');d.append(sum,body);item.querySelector('.gt-wins').append(d);
  d.addEventListener('keydown',e=>{if(e.key==='Escape'&&d.classList.contains('gt-big')){d.classList.remove('gt-big');big.textContent='放大'}});
  let loaded=null;const load=()=>{if(!loaded)loaded=render(w,body,item).catch(e=>{body.replaceChildren(mk('div','gt-err',String(e?.message||'打不开')))});return loaded};
  if(open)load();else d.addEventListener('toggle',()=>{if(d.open)load()});
  return load;
 }
 function itemNode({question,created_at,status}){
  const li=mk('li','gt-item');li.dataset.status=status;const top=mk('div','gt-top');const del=mk('button','gt-mini','×');del.type='button';del.title='删除这条';del.hidden=true;
  top.append(mk('span','gt-time',timeLabel(created_at)),mk('span','gt-q',question),del);
  const stages=mk('div','gt-stages');STAGES.forEach(([k,label],i)=>{if(i)stages.append(mk('span','gt-arrow','→'));const s=mk('span','gt-stage',label);s.dataset.k=k;s.dataset.s='wait';stages.append(s)});
  li.append(top,stages,mk('div','gt-src'),mk('div','gt-wins'));
  li.stage=(k,s)=>{const n=stages.querySelector(`[data-k="${k}"]`);if(n)n.dataset.s=s};
  li.sources=labels=>{const src=li.querySelector('.gt-src');src.replaceChildren(...labels.map(l=>mk('span','',l)))};
  li.setId=id=>{li.dataset.id=String(id);del.hidden=false;del.onclick=async()=>{try{await call({action:'timeline',op:'delete',id});li.remove();refresh()}catch(e){li.querySelector('.gt-src').append(mk('span','',e.message))}}};
  return li;
 }

 function begin(question){
  for(const d of list.querySelectorAll('.gt-win[open]:not(.gt-big)'))d.open=false;
  const started=new Date().toISOString(),persona=getPersona();const li=itemNode({question,created_at:started,status:'running'});list.prepend(li);refresh();li.scrollIntoView?.({block:'nearest'});
  li.stage('need','active');let saved=false;
  const save=async(status,route,steps,windows)=>{if(saved)return;saved=true;try{const r=await call({action:'timeline',op:'add',persona,question:String(question).slice(0,500),status,route,steps,windows:windows.map(storable).filter(Boolean)});if(Number.isInteger(r?.id))li.setId(r.id)}catch{}};
  return {
   node:li,
   done(result){
    li.stage('need','done');const labels=sourceLabels(result);li.sources(labels);li.stage('data',labels.length?'done':'skip');
    const windows=windowsFrom(result);li.stage('act',windows.length?'active':'skip');
    const loads=windows.map(w=>addWindow(li,w,{open:true}));
    li.stage('answer','done');li.dataset.status='done';
    const settle=Promise.race([Promise.allSettled(loads.map(l=>l())),new Promise(r=>setTimeout(r,20000))]);
    settle.then(()=>{if(windows.length)li.stage('act','done');save('done',String(result?.context?.route||result?.provider||''),labels,windows)});
    return settle;
   },
   fail(message){li.stage('need','done');for(const k of ['data','act','answer'])li.stage(k,'fail');li.dataset.status='failed';li.querySelector('.gt-src').append(mk('div','gt-err',String(message||'没有完成')));save('failed','',[],[])},
   addWindow:w=>addWindow(li,w,{open:true}),
  };
 }
 async function load(){
  list.replaceChildren();refresh();
  try{const d=await call({action:'timeline',op:'list',persona:getPersona(),limit:30});
   for(const e of d?.entries||[]){const li=itemNode(e);list.append(li);for(const [k] of STAGES)li.stage(k,e.status==='failed'?'fail':'done');li.stage('need','done');li.sources(e.steps||[]);if(!(e.steps||[]).length)li.stage('data','skip');if(!(e.windows||[]).length)li.stage('act','skip');
    for(const w of e.windows||[])addWindow(li,w.kind==='evidence'?{...w,card:w.card}:w,{open:false});li.setId(e.id)}
  }catch(e){empty.textContent='历史需求暂时读不到：'+e.message}
  refresh();
 }
 refresh();
 return {begin,load,el:box};
}
