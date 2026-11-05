// Load a fixed browser UMD dependency without evaluating fetched strings.
export function loadBrowserScript(url,{document:doc=document,timeoutMs=8000,select=()=>true}={}){
 return new Promise((resolve,reject)=>{
  const script=doc.createElement('script');let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();reject(error)}else resolve(value)};
  const timer=setTimeout(()=>finish(new Error('客户端依赖加载超时')),timeoutMs);
  script.src=url;script.async=true;
  script.onload=()=>{try{const value=select();if(!value)throw new Error('客户端依赖未就绪');finish(null,value)}catch(error){finish(error)}};
  script.onerror=()=>finish(new Error('客户端依赖无法读取'));
  doc.head.appendChild(script);
 });
}
