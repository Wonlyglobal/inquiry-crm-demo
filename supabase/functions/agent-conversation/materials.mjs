import {materialQuery,normalizeDocument,documentEvidence,coverageSummary} from './document-knowledge.mjs';
import {signMaterialRequest} from './material-request-proof.mjs';
import {boundedBytes} from './bailian.mjs';
export async function loadFullMaterials({actor,privateJwk,serviceUrl,secret,question},fetcher=fetch){
 if(!serviceUrl||!secret||!privateJwk||!actor)return {status:'not_configured',assets:[]};
 let url;try{url=new globalThis.URL(serviceUrl);if(url.protocol!=='https:'||!['file.foreverdoodle.com'].includes(url.hostname)||url.username||url.password)throw Error();url.pathname='/api/integrations/crm/knowledge';url.search='';url.hash=''}catch{return {status:'not_configured',assets:[]}}
 const {query,terms,page,constraints}=materialQuery(question);
 let stage='signing';
 try{const body=JSON.stringify({query,terms,page,constraints});const proof=await signMaterialRequest({body,actor,privateJwk});stage='connection';const r=await fetcher(url.href,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'X-CRM-Proof':proof,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(18000)});if(!r.ok)return {status:'unavailable',code:'http_'+r.status,assets:[]};const data=JSON.parse(new TextDecoder().decode(await boundedBytes(r,1024*1024)));if(data.status!=='available'||data.scope!=='authorized_material_library'||!Array.isArray(data.assets))return {status:'unavailable',code:'invalid_response',assets:[]};return {...data,assets:data.assets.slice(0,20).map(a=>({id:String(a.id),name:String(a.name).slice(0,200),type:String(a.type||''),language:String(a.language||''),versionLabel:String(a.versionLabel||''),isCurrentVersion:a.isCurrentVersion===true,updatedAt:String(a.updatedAt||''),visibility:a.visibility==='public'?'public':'internal',excerpt:String(a.excerpt||'').slice(0,600),document:normalizeDocument(a.document),video:a.type==='视频'?{status:['ready','partial','queued','processing','failed'].includes(a.video?.status)?a.video.status:'not_indexed',segments:Array.isArray(a.video?.segments)?a.video.segments.filter(s=>['speech','screen_text','visual_inference'].includes(s.kind)&&Number.isFinite(s.start)&&s.start>=0&&s.start<=3600).slice(0,6).map(s=>({kind:s.kind,start:s.start,text:String(s.text||'').slice(0,500)})):[]}:null,relativePath:String(a.relativePath||'').slice(0,500),openUrl:'https://file.foreverdoodle.com:8088/#library/folder/'+encodeURIComponent(String(a.relativePath||'').split('/').slice(0,-1).join('/'))}))}}
 catch(error){console.error('material_lookup_failure',stage,error instanceof Error?error.name:'unknown');return {status:'unavailable',code:stage==='signing'?'signing_failed':'connection_failed',assets:[]}}
}
export function fullMaterialAnswer(data){
 if(data.status!=='available')return (data.status==='not_configured'?'物料库连接尚未正确配置。':data.code==='signing_failed'?'物料库签名配置暂不可用。':data.code==='http_401'||data.code==='http_403'?'物料库未通过账号授权校验。':data.code==='http_404'?'物料库全库接口尚未就绪。':'物料库连接暂时未完成。')+'不能把营销资料目录当作全库，请稍后重试。';
 return `已查询你有权访问的物料库，第${data.page}页，本页${data.assets.length}项${data.match_total==null?'':`，匹配共${data.match_total}项`}。内部内容仅在公司系统内检索，没有发送给外部模型。\n\n`+coverageSummary(data.document_coverage)+'\n'+data.assets.map((a,i)=>`${i+1}. ${a.name}\n${a.language||'语言未标注'}｜${a.versionLabel||'版本未标注'}｜${a.isCurrentVersion?'当前版本':'历史版本'}｜更新：${a.updatedAt}\n${a.relativePath}\n${a.video?videoEvidence(a.video):a.document&&a.document.status!=='not_indexed'?documentEvidence(a.document):(a.excerpt?'已有检索索引摘录（非全文阅读）：'+a.excerpt:'没有可用正文索引，当前仅能按文件信息查找。')}`).join('\n\n')+`\n\n${data.has_more?'可能还有下一页，请说“物料第'+(data.page+1)+'页”。':''}公司资料更新不代表全部公司动态。`;
}

export function videoEvidence(video){
 const labels={ready:'已完成采样解析',partial:'部分解析，存在未完成画面',queued:'等待后台解析',processing:'正在后台解析',failed:'解析失败，尚无可靠内容',not_indexed:'尚未解析视频内容'};
 const kinds={speech:'语音转写',screen_text:'画面文字',visual_inference:'画面推测'};
 const time=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
 return '视频：'+(labels[video.status]||labels.not_indexed)+'。采样不代表逐帧理解，转写及模型描述需核对。'+(video.segments.length?'\n'+video.segments.map(s=>`[${time(s.start)} ${kinds[s.kind]}] ${s.text}`).join('\n'):'');
}
