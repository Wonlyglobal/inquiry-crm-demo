// Catalogue viewer: flip through a private catalogue (page images behind 30-minute signed links).
// Opens inside the CRM page (never blocked); "新窗口" writes the same viewer into a window the user opened.
const CSS=`.acv{position:fixed;inset:0;z-index:9999;background:rgba(6,10,20,.94);display:flex;flex-direction:column;color:#e5e7eb;font:14px/1.4 system-ui,sans-serif}
.acv header{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid #1f2937}
.acv header strong{flex:1;font-size:15px}.acv button{background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:8px;padding:6px 12px;cursor:pointer}
.acv button:disabled{opacity:.4;cursor:default}.acv .stage{flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:12px}
.acv img{max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 8px 30px rgba(0,0,0,.5);background:#fff}
.acv .msg{color:#9ca3af}.acv input{width:56px;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:4px;text-align:center}`;
export function safeImageUrl(u){try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:null}catch{return null}}
// JSON for inline <script>: escape '<' so data can never close the script tag.
const inlineJson=v=>JSON.stringify(v).replace(/</g,'\\u003c');
export function clampPage(n,total){n=Math.floor(Number(n)||1);return Math.min(Math.max(1,n),Math.max(1,total))}

// Minimal self-contained viewer document for a separate window (same images, keyboard flipping).
export function viewerDocument(title,urls,start){
 const safe=urls.map(safeImageUrl);
 return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${String(title).replace(/[<>&"]/g,'')}</title><style>${CSS}body{margin:0;background:#060a14}</style><div class="acv" style="position:static;height:100vh"><header><strong></strong><button id="p">上一页</button><span><input id="n"> / ${safe.length}</span><button id="x">下一页</button></header><div class="stage"><img id="i" alt=""></div></div><script>const u=${inlineJson(safe)};let k=${clampPage(start,safe.length)};const i=document.getElementById('i'),n=document.getElementById('n');document.querySelector('strong').textContent=${inlineJson(String(title))};function go(v){k=Math.min(Math.max(1,v),u.length);i.src=u[k-1]||'';i.alt='第'+k+'页';n.value=k;document.getElementById('p').disabled=k<=1;document.getElementById('x').disabled=k>=u.length;if(u[k])new Image().src=u[k]}document.getElementById('p').onclick=()=>go(k-1);document.getElementById('x').onclick=()=>go(k+1);n.onchange=()=>go(Number(n.value)||1);addEventListener('keydown',e=>{if(e.key==='ArrowLeft')go(k-1);if(e.key==='ArrowRight')go(k+1)});go(k)<\/script>`;
}

export function openCatalogViewer({title,urls,start=1,doc=document,win=window}){
 const pages=(urls||[]).map(safeImageUrl);if(!pages.length)throw Error('画册页面暂时打不开');
 if(!doc.getElementById('acv-style')){const st=doc.createElement('style');st.id='acv-style';st.textContent=CSS;doc.head.append(st)}
 doc.querySelector('.acv')?.remove();
 const root=doc.createElement('div');root.className='acv';root.setAttribute('role','dialog');root.setAttribute('aria-label',title+' 画册');
 const bar=doc.createElement('header'),name=doc.createElement('strong');name.textContent=title;
 const prev=doc.createElement('button'),next=doc.createElement('button'),own=doc.createElement('button'),close=doc.createElement('button');
 prev.textContent='上一页';next.textContent='下一页';own.textContent='新窗口打开';close.textContent='关闭';for(const b of [prev,next,own,close])b.type='button';
 const box=doc.createElement('span'),num=doc.createElement('input');num.setAttribute('aria-label','页码');box.append(num,doc.createTextNode(' / '+pages.length));
 bar.append(name,prev,box,next,own,close);
 const stage=doc.createElement('div');stage.className='stage';const img=doc.createElement('img');stage.append(img);root.append(bar,stage);doc.body.append(root);
 let k=clampPage(start,pages.length);
 const go=v=>{k=clampPage(v,pages.length);img.src=pages[k-1]||'';img.alt=title+' 第'+k+'页';num.value=String(k);prev.disabled=k<=1;next.disabled=k>=pages.length;if(pages[k]){const pre=new win.Image();pre.src=pages[k]}};
 const onKey=e=>{if(e.key==='ArrowLeft')go(k-1);else if(e.key==='ArrowRight')go(k+1);else if(e.key==='Escape')shut()};
 const shut=()=>{doc.removeEventListener('keydown',onKey);root.remove()};
 prev.onclick=()=>go(k-1);next.onclick=()=>go(k+1);num.onchange=()=>go(num.value);close.onclick=shut;
 own.onclick=()=>{const w=win.open('about:blank','_blank');if(!w)return;w.opener=null;w.document.write(viewerDocument(title,pages,k));w.document.close();shut()};
 doc.addEventListener('keydown',onKey);go(k);
 return {go,close:shut,page:()=>k};
}
