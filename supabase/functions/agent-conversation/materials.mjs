import {boundedBytes} from './bailian.mjs';
export async function loadFullMaterials({authorization,serviceUrl,secret,question},fetcher=fetch){
 if(!serviceUrl||!secret)return {status:'not_configured',assets:[]};
 let url;try{url=new globalThis.URL(serviceUrl);if(url.protocol!=='https:'||!['file.foreverdoodle.com'].includes(url.hostname)||url.username||url.password)throw Error();url.pathname='/api/integrations/crm/knowledge';url.search='';url.hash=''}catch{return {status:'not_configured',assets:[]}}
 const query=/最新|动态|所有资料|全部资料/.test(question)?'':String(question).replace(/^.*?[：:]/,'').replace(/帮我|请|找到|查找|找一下|查一下|资料库|物料系统|资料|物料|文件|给我|我要|想要|找/g,'').trim().slice(0,120);
 const page=Number(String(question).match(/第\s*(\d+)\s*页/)?.[1]||1);
 try{const r=await fetcher(url.href,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'X-CRM-Authorization':authorization,'Content-Type':'application/json'},body:JSON.stringify({query:query.replace(/第\s*\d+\s*页/g,'').trim(),page}),signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error();const data=JSON.parse(new TextDecoder().decode(await boundedBytes(r,1024*1024)));if(data.status!=='available'||data.scope!=='authorized_material_library'||!Array.isArray(data.assets))throw Error();return {...data,assets:data.assets.slice(0,20).map(a=>({id:String(a.id),name:String(a.name).slice(0,200),type:String(a.type||''),language:String(a.language||''),versionLabel:String(a.versionLabel||''),isCurrentVersion:a.isCurrentVersion===true,updatedAt:String(a.updatedAt||''),visibility:a.visibility==='public'?'public':'internal',excerpt:String(a.excerpt||'').slice(0,600),relativePath:String(a.relativePath||'').slice(0,500),openUrl:'https://file.foreverdoodle.com:8088/#library/folder/'+encodeURIComponent(String(a.relativePath||'').split('/').slice(0,-1).join('/'))}))}}
 catch{return {status:'unavailable',assets:[]}}
}
export function fullMaterialAnswer(data){
 if(data.status!=='available')return '全库资料接口尚未取得可用结果；不能把营销资料目录当作全库。请稍后重试。';
 return `已查询你有权访问的物料库，第${data.page}页，本页${data.assets.length}项${data.match_total==null?'':`，匹配共${data.match_total}项`}。内部内容仅在公司系统内检索，没有发送给外部模型。\n\n`+data.assets.map((a,i)=>`${i+1}. ${a.name}\n${a.language||'语言未标注'}｜${a.versionLabel||'版本未标注'}｜${a.isCurrentVersion?'当前版本':'历史版本'}｜更新：${a.updatedAt}\n${a.relativePath}\n${a.excerpt?'已有检索索引摘录（非全文阅读）：'+a.excerpt:'没有可用正文索引，当前仅能按文件信息查找。'}`).join('\n\n')+`\n\n${data.has_more?'可能还有下一页，请说“物料第'+(data.page+1)+'页”。':''}公司资料更新不代表全部公司动态。`;
}
