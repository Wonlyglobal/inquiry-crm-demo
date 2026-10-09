// Catalogue viewer (owner, 2026-09-28): a small window inside the Grace conversation, never a new browser
// window. Pages are private images behind 30-minute signed links; "下载 PDF" hands over the whole catalogue.
const CSS=`.acv{margin:10px 0;border:1px solid #d1d5db;border-radius:12px;background:#0f172a;color:#e5e7eb;font:13px/1.4 system-ui,sans-serif;overflow:hidden;outline:none}
.acv.acv-big{position:fixed;inset:12px;z-index:9999;margin:0;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.6)}
.acv .acv-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #1f2937}
.acv .acv-bar strong{flex:1 1 120px;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acv button,.acv a.acv-pdf{background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:8px;padding:4px 10px;cursor:pointer;font:inherit;text-decoration:none}
.acv a.acv-pdf,.acv button.acv-pdf{background:#2563eb;border-color:#2563eb;color:#fff}
.acv button:disabled{opacity:.4;cursor:default}
.acv .acv-stage{display:flex;align-items:center;justify-content:center;background:#111827;height:340px;padding:8px}
.acv.acv-big .acv-stage{flex:1;height:auto}
.acv img{max-width:100%;max-height:100%;object-fit:contain;background:#fff;cursor:zoom-in}
.acv.acv-big img{cursor:zoom-out}
.acv input{width:48px;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:3px;text-align:center;font:inherit}
.acv .acv-msg{padding:6px 10px;color:#9ca3af;font-size:12px}
.acv.acv-compact .acv-bar{flex-wrap:nowrap;gap:4px;padding:6px 8px}.acv.acv-compact .acv-bar strong{display:none}.acv.acv-compact button,.acv.acv-compact a.acv-pdf{padding:3px 8px;white-space:nowrap}.acv.acv-compact .acv-bar .acv-pdf{margin-left:auto}.acv.acv-compact .acv-bar span{white-space:nowrap}`;
export function safeImageUrl(u){try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:null}catch{return null}}
export function clampPage(n,total){n=Math.floor(Number(n)||1);return Math.min(Math.max(1,n),Math.max(1,total))}

// Renders into `container` (the conversation). Arrow keys work while the viewer has focus, so typing
// in the chat box is never hijacked. Click the page (or 放大) to enlarge inside the same browser page.
export function openCatalogViewer({title,urls,start=1,pdf=null,material=null,onMaterialDownload=null,container,compact=false,doc=document,win=window}){
 const pages=(urls||[]).map(safeImageUrl);if(!pages.length||pages.every(p=>!p))throw Error('画册页面暂时打不开');
 if(!container)throw Error('缺少显示位置');
 if(!doc.getElementById('acv-style')){const st=doc.createElement('style');st.id='acv-style';st.textContent=CSS;doc.head.append(st)}
 const root=doc.createElement('div');root.className='acv';root.setAttribute('role','region');root.setAttribute('aria-label',title+' 画册');root.tabIndex=0;if(compact)root.classList.add('acv-compact');
 const bar=doc.createElement('div');bar.className='acv-bar';const name=doc.createElement('strong');name.textContent=title;
 const prev=doc.createElement('button'),next=doc.createElement('button'),big=doc.createElement('button'),close=doc.createElement('button');
 prev.textContent='上一页';next.textContent='下一页';big.textContent='放大';close.textContent='收起';for(const b of [prev,next,big,close])b.type='button';
 const box=doc.createElement('span'),num=doc.createElement('input');num.setAttribute('aria-label','页码');box.append(num,doc.createTextNode(' / '+pages.length));
 bar.append(name,prev,box,next);if(!compact)bar.append(big);
 const pdfUrl=safeImageUrl(pdf);
 const fromLibrary=!!(material?.id&&typeof onMaterialDownload==='function');
 if(fromLibrary){const b=doc.createElement('button');b.type='button';b.className='acv-pdf';b.textContent='下载 PDF';b.title='从物料库下载原文件：'+String(material.name||'');b.onclick=async()=>{b.disabled=true;try{await onMaterialDownload(material)}catch(e){msg.textContent=String(e?.message||'下载没有开始，请稍后再试')}finally{b.disabled=false}};bar.append(b)}
 else if(pdfUrl){const a=doc.createElement('a');a.className='acv-pdf';a.href=pdfUrl;a.textContent='下载 PDF';a.setAttribute('download','');a.rel='noopener';bar.append(a)}
 if(!compact)bar.append(close);
 const stage=doc.createElement('div');stage.className='acv-stage';const img=doc.createElement('img');stage.append(img);
 const msg=doc.createElement('div');msg.className='acv-msg';msg.textContent=fromLibrary?'PDF 从物料库下载原文件：'+String(material.name||'')+'。':(pdfUrl?'':'物料库里没找到这本画册的 PDF，可以先翻页查看。')+'链接半小时内有效。';
 root.append(bar,stage,msg);container.append(root);
 let k=clampPage(start,pages.length);
 const go=v=>{k=clampPage(v,pages.length);img.src=pages[k-1]||'';img.alt=title+' 第'+k+'页';num.value=String(k);prev.disabled=k<=1;next.disabled=k>=pages.length;if(pages[k]){const pre=new win.Image();pre.src=pages[k]}};
 const toggle=on=>{const want=on??!root.classList.contains('acv-big');root.classList.toggle('acv-big',want);big.textContent=want?'缩小':'放大'};
 const shut=()=>root.remove();
 root.addEventListener('keydown',e=>{if(e.target===num)return;if(e.key==='ArrowLeft'){go(k-1);e.preventDefault()}else if(e.key==='ArrowRight'){go(k+1);e.preventDefault()}else if(e.key==='Escape')toggle(false)});
 prev.onclick=()=>go(k-1);next.onclick=()=>go(k+1);num.onchange=()=>go(num.value);big.onclick=()=>toggle();img.onclick=()=>{if(!compact)toggle()};close.onclick=shut;
 go(k);try{root.scrollIntoView?.({block:'nearest'})}catch{}
 return {go,close:shut,page:()=>k,root,toggle};
}
