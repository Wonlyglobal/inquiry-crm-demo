import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const reply=(status:number,result:unknown)=>new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async request=>{
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 const token=Deno.env.get('MAIL_SYNC_WORKER_TOKEN');
 if(!token||request.headers.get('x-mail-sync-token')!==token)return reply(401,{error:'unauthorized'});
 const webhook=Deno.env.get('FEISHU_WEBHOOK_URL')||'';
 if(!webhook)return reply(503,{error:'feishu_not_configured'});
 let key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||key}catch{}
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',key,{auth:{persistSession:false}});
 const {data,error}=await db.rpc('claim_sales_lead_delivery');if(error)return reply(500,{error:'queue_unavailable'});
 let delivered=0,failed=0;
 for(const item of data||[]){let ok=false;try{
  const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msg_type:'text',content:{text:item.body}}),signal:AbortSignal.timeout(10000)});
  const result=await response.json();ok=response.ok&&result.code===0;
 }catch{}const saved=await db.rpc('finish_sales_lead_delivery',{target:item.id,succeeded:ok});if(saved.error||!ok)failed++;else delivered++}
 return reply(failed?502:200,{delivered,failed});
});
