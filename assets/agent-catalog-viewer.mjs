// Catalogue viewer (owner, 2026-09-28): a small window inside the Grace conversation, never a new browser
// window. Pages are private images behind 30-minute signed links; "下载 PDF" hands over the whole catalogue.
import {revealInPanel} from './agent-panel-scroll.mjs?v=20261020-layout4';
const CSS=`.acv{margin:10px 0;border:1px solid #d1d5db;border-radius:12px;background:#0f172a;color:#e5e7eb;font:13px/1.4 system-ui,sans-serif;overflow:hidden;outline:none;min-width:0;max-width:100%;box-sizing:border-box}
.acv.acv-big{position:fixed;inset:12px;z-index:9999;margin:0;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.6)}
.acv .acv-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #1f2937}
.acv .acv-bar strong{flex:1 1 120px;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acv button,.acv a.acv-pdf{background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:8px;padding:4px 10px;cursor:pointer;font:inherit;text-decoration:none}
.acv a.acv-pdf,.acv button.acv-pdf{background:#2563eb;border-color:#2563eb;color:#fff}
.acv button:disabled{opacity:.4;cursor:default}
.acv .acv-stage{display:flex;align-items:center;justify-content:center;background:#111827;height:clamp(160px,35dvh,340px);padding:8px;min-width:0;min-height:0;overflow:hidden;box-sizing:border-box}
.acv.acv-big .acv-stage{flex:1;height:auto;min-height:0}
.acv img{display:block;min-width:0;min-height:0;max-width:100%;max-height:100%;object-fit:contain;background:#fff;cursor:zoom-in}
.acv.acv-big img{cursor:zoom-out}
.acv input{width:48px;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:3px;text-align:center;font:inherit}
.acv .acv-msg{padding:6px 10px;color:#9ca3af;font-size:12px;overflow-wrap:anywhere}
.acv.acv-compact .acv-bar{flex-wrap:wrap;gap:4px;padding:6px 8px}.acv.acv-compact .acv-bar strong{display:none}.acv.acv-compact button,.acv.acv-compact a.acv-pdf{padding:6px 8px;min-height:36px;white-space:nowrap}.acv.acv-compact .acv-bar .acv-pdf{margin-left:auto}.acv.acv-compact .acv-bar span{white-space:nowrap}
.acv.acv-big{max-width:none;max-height:none;width:auto;height:auto;inset:12px;inset:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));box-sizing:border-box}
.acv.acv-big .acv-bar{flex:none}.acv.acv-big .acv-msg{flex:none;max-height:25%;overflow:auto}.acv.acv-big .acv-msg::after{content:' 按 Esc 或“返回预览”继续对话。'}.acv.acv-big .acv-bar strong{display:block;flex-basis:100%}.acv::backdrop{background:rgba(2,8,23,.78)}
@media(max-width:480px){.acv.acv-big{inset:8px}.acv .acv-bar{gap:4px}.acv .acv-bar button{min-height:40px;padding:6px 8px}.acv input{width:42px}}`;
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
 bar.append(name,prev,box,next,big);if(compact)big.textContent='放大阅读';
 const pdfUrl=safeImageUrl(pdf);
 const fromLibrary=!!(material?.id&&typeof onMaterialDownload==='function');
 if(fromLibrary){const b=doc.createElement('button');b.type='button';b.className='acv-pdf';b.textContent='下载 PDF';b.title='从物料库下载原文件：'+String(material.name||'');b.onclick=async()=>{b.disabled=true;try{await onMaterialDownload(material)}catch(e){msg.textContent=String(e?.message||'下载没有开始，请稍后再试')}finally{b.disabled=false}};bar.append(b)}
 else if(pdfUrl){const a=doc.createElement('a');a.className='acv-pdf';a.href=pdfUrl;a.textContent='下载 PDF';a.setAttribute('download','');a.rel='noopener';bar.append(a)}
 if(!compact)bar.append(close);
 const stage=doc.createElement('div');stage.className='acv-stage';const img=doc.createElement('img');stage.append(img);
 const msg=doc.createElement('div');msg.className='acv-msg';msg.textContent=fromLibrary?'PDF 从物料库下载原文件：'+String(material.name||'')+'。':(pdfUrl?'':'物料库里没找到这本画册的 PDF，可以先翻页查看。')+'链接半小时内有效。';
 root.append(bar,stage,msg);container.append(root);
 let k=clampPage(start,pages.length),anchor=null,observer=null,native=false,expanded=false;
 const escapeReader=e=>{if(expanded&&e.key==='Escape'){toggle(false);e.preventDefault?.();e.stopPropagation?.()}};
 const go=v=>{k=clampPage(v,pages.length);img.src=pages[k-1]||'';img.alt=title+' 第'+k+'页';num.value=String(k);prev.disabled=k<=1;next.disabled=k>=pages.length;if(pages[k]){const pre=new win.Image();pre.src=pages[k]}};
 const toggle=on=>{const want=on??!expanded;if(want===expanded)return want;expanded=want;
  if(want){root.classList.add('acv-big');if(typeof root.showPopover==='function'){try{root.setAttribute('popover','manual');root.showPopover();native=true}catch{root.removeAttribute('popover')}}
   if(!native){anchor=doc.createElement('span');anchor.hidden=true;root.before?.(anchor);doc.body.append(root)}
   if(win.MutationObserver){observer=new win.MutationObserver(()=>{if(native?!root.isConnected:anchor&&!anchor.isConnected)shut()});observer.observe(doc.documentElement,{childList:true,subtree:true})}
   win.addEventListener?.('pagehide',shut);doc.addEventListener?.('keydown',escapeReader);root.focus?.({preventScroll:true});
  }else{win.removeEventListener?.('pagehide',shut);doc.removeEventListener?.('keydown',escapeReader);observer?.disconnect();observer=null;if(native){try{root.hidePopover()}catch{}root.removeAttribute('popover');native=false}if(anchor){if(anchor.isConnected)anchor.replaceWith(root);else if(!root.before)container.append(root);else root.remove();anchor=null}root.classList.toggle('acv-big',false);big.focus?.({preventScroll:true})}
  big.textContent=want?'返回预览':compact?'放大阅读':'放大';return want;
 };
 const shut=()=>{toggle(false);root.remove();win.removeEventListener?.('pagehide',shut)};
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){escapeReader(e);return}if(e.target===num){if(e.key==='Enter'){go(num.value);e.preventDefault()}return}if(e.key==='ArrowLeft'){go(k-1);e.preventDefault()}else if(e.key==='ArrowRight'){go(k+1);e.preventDefault()}});
 prev.onclick=()=>go(k-1);next.onclick=()=>go(k+1);num.onchange=()=>go(num.value);big.onclick=()=>toggle();img.onclick=()=>toggle();close.onclick=shut;
 go(k);revealInPanel(root,container.closest?.('#room-timeline,.ai-messages')||container);
 return {go,close:shut,page:()=>k,root,toggle};
}
