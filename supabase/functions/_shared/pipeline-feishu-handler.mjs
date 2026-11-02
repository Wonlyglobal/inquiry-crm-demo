import {pipelineMessage} from './pipeline-feishu-message.mjs';
const reply=(status,result)=>new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function pipelineHandler({env,createDb,fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('')}){
 return async request=>{
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const token=env('MAIL_SYNC_WORKER_TOKEN');
  if(!token||request.headers.get('x-mail-sync-token')!==token)return reply(401,{error:'unauthorized'});
  if(env('CRM_PIPELINE_FEISHU_ENABLED')!=='true')return reply(503,{error:'pipeline_disabled'});
  const webhook=env('CRM_PIPELINE_FEISHU_WEBHOOK_URL')||'';
  if(!/^https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(webhook))return reply(503,{error:'destination_not_configured'});
  try{
   const db=createDb(),{data,error}=await db.rpc('claim_pipeline_feishu',{destination_hash:await digest(webhook)});
   if(error||!Array.isArray(data))return reply(503,{error:'queue_unavailable'});
   let delivered=0,failed=0,uncertain=0;
   for(const [index,item] of data.entries()){
    if(index)await wait(500);
    let ok=false,code='network_or_timeout',message;
    try{message=pipelineMessage(item);if(new TextEncoder().encode(JSON.stringify(message)).length>18000)throw new Error('payload_too_large')}catch{code='payload_rejected'}
    if(message&&code!=='payload_rejected')try{
     const response=await fetcher(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message),signal:AbortSignal.timeout(10000)});
     const result=await response.json();ok=response.ok&&result.code===0;
     code=response.status===429||result.code===11232?'provider_rate_limited':!response.ok?'http_error':'provider_rejected';
    }catch{}
    const saved=await db.rpc('finish_pipeline_feishu',{target:item.id,lease:item.lease_token,succeeded:ok,error_class:ok?null:code});
    if(saved.error)uncertain++;else if(ok)delivered++;else failed++;
   }
   return reply(failed||uncertain?502:200,{delivered,failed,uncertain});
  }catch{return reply(503,{error:'worker_unavailable'})}
 };
}
