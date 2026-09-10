import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Content-Type":"application/json"};
const allowedRoles=new Set(["sales","sales_manager","marketing","owner"]);
const clean=(value:unknown,max=500)=>String(value||"").trim().slice(0,max);
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error||"未知错误");
function envKey(grouped:string,standard:string){const value=Deno.env.get(grouped);if(value){try{return JSON.parse(value).default||""}catch{}}return Deno.env.get(standard)||""}
function bytesToBase64(bytes:Uint8Array){let binary="";for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));return btoa(binary)}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const authorization=request.headers.get("Authorization")||"",supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
    const userClient=createClient(supabaseUrl,envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),{global:{headers:{Authorization:authorization}}});
    const admin=createClient(supabaseUrl,envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)throw new Error("未登录");
    const {data:profile,error:profileError}=await userClient.from("profiles").select("id,role,active").eq("id",user.id).single();
    if(profileError||!profile?.active||!allowedRoles.has(profile.role))throw new Error("当前账号无权访问销售资料");
    const serviceUrl=clean(Deno.env.get("MATERIAL_LIBRARY_URL"),500).replace(/\/$/,"");
    const integrationSecret=clean(Deno.env.get("MATERIAL_LIBRARY_SECRET"),500);
    if(!serviceUrl||!integrationSecret)throw new Error("物料库连接尚未配置");
    const input=await request.json().catch(()=>({})),action=clean(input.action,30)||"list";
    if(action==="list"){
      const query=clean(input.query,120),limit=Math.min(Math.max(Number(input.limit)||200,1),500);
      const response=await fetch(`${serviceUrl}/api/integrations/crm/assets?q=${encodeURIComponent(query)}&limit=${limit}`,{headers:{Authorization:`Bearer ${integrationSecret}`},signal:AbortSignal.timeout(15000)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||"物料库暂时不可用");
      return new Response(JSON.stringify(payload),{headers:{...cors,"Cache-Control":"private, max-age=15"}});
    }
    if(action==="download"){
      const assetId=clean(input.asset_id,100);if(!assetId)throw new Error("未选择物料");
      const response=await fetch(`${serviceUrl}/api/integrations/crm/assets/${encodeURIComponent(assetId)}/download`,{headers:{Authorization:`Bearer ${integrationSecret}`,"X-CRM-User-ID":user.id},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error(response.status===404?"物料不存在或已更新":"物料下载失败");
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(!bytes.length||bytes.length>8*1024*1024)throw new Error("单个邮件附件必须小于 8MB");
      const disposition=response.headers.get("content-disposition")||"",encoded=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const name=encoded?decodeURIComponent(encoded):`material-${assetId}`;
      await admin.from("audit_logs").insert({actor_id:user.id,entity_type:"material_asset",entity_id:null,action:"material_attachment_loaded",after_data:{asset_id:assetId,name,size_bytes:bytes.length},reason:"CRM 邮件选择物料库附件"});
      return new Response(JSON.stringify({id:assetId,name,type:response.headers.get("content-type")||"application/octet-stream",sizeBytes:bytes.length,base64:bytesToBase64(bytes)}),{headers:cors});
    }
    throw new Error("不支持的物料库操作");
  }catch(error){return new Response(JSON.stringify({error:errorText(error)}),{status:400,headers:cors})}
});
