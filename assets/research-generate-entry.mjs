// The visible shortcut uses the existing authorized research action.
export function bindResearchGenerateEntry({source,shortcut,Observer=MutationObserver}){
 const sync=()=>{shortcut.disabled=source.disabled;shortcut.hidden=source.hidden||source.classList.contains('hidden');const busy=source.getAttribute('aria-busy')==='true';shortcut.textContent=busy?'正在生成背调…':'生成背调';if(busy)shortcut.setAttribute('aria-busy','true');else shortcut.removeAttribute('aria-busy')};
 const run=()=>{if(source.disabled||source.hidden||source.classList.contains('hidden'))return;source.click()};
 shortcut.addEventListener('click',run);const observer=new Observer(sync);observer.observe(source,{attributes:true,attributeFilter:['disabled','hidden','class','aria-busy'],childList:true,subtree:true});sync();
 return ()=>{observer.disconnect();shortcut.removeEventListener('click',run)};
}
