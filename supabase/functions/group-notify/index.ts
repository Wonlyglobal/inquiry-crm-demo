import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Content-Type":"application/json"};
function envKey(grouped:string,standard:string){const value=Deno.env.get(grouped);if(value){try{return JSON.parse(value).default||""}catch{}}return Deno.env.get(standard)||""}
function text(value:unknown,max=500){return String(value||"").trim().slice(0,max)}
const actionNames:Record<string,string>={assigned:"询盘已分配/转派",registered:"新询盘已提交分配"};

async function postFeishu(url:string,content:string){
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({msg_type:"text",content:{text:content}}),signal:AbortSignal.timeout(15000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.code!==0)throw new Error(text(result.msg||`HTTP ${response.status}`));
}
async function postDingTalk(url:string,content:string){
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({msgtype:"text",text:{content}}),signal:AbortSignal.timeout(15000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||Number(result.errcode)!==0)throw new Error(text(result.errmsg||`HTTP ${response.status}`));
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const authorization=request.headers.get("Authorization")||"",url=Deno.env.get("SUPABASE_URL")||"";
    const userClient=createClient(url,envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),{global:{headers:{Authorization:authorization}}});
    const admin=createClient(url,envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();if(userError||!user)throw new Error("未登录");
    const {data:caller,error:callerError}=await userClient.from("profiles").select("id,full_name,role,active").eq("id",user.id).single();
    if(callerError||!caller?.active||!["owner","sales_manager","marketing"].includes(caller.role))throw new Error("当前角色无权发送群通知");
    const body=await request.json(),inquiryId=text(body.inquiry_id,80),action=text(body.action,40);
    if(!inquiryId||!actionNames[action])throw new Error("通知参数不完整");
    const {data:inquiry,error:inquiryError}=await admin.from("inquiries").select("id,inquiry_no,title,status,owner_id,target_country,product_category").eq("id",inquiryId).single();
    if(inquiryError||!inquiry)throw new Error("询盘不存在");
    const {data:ownerProfile}=inquiry.owner_id?await admin.from("profiles").select("full_name").eq("id",inquiry.owner_id).maybeSingle():{data:null};const owner=ownerProfile?.full_name;
    const content=[`【WONLY CRM】${actionNames[action]}`,`询盘：#${String(inquiry.inquiry_no||"").padStart(6,"0")} ${inquiry.title||"未命名询盘"}`,`负责人：${owner||"待分配"}`,`国家/地区：${inquiry.target_country||"待补充"}`,`产品：${inquiry.product_category||"待补充"}`,`操作人：${caller.full_name||"CRM 成员"}`,`详情：http://crm.foreverdoodle.com/#inquiry/${inquiry.id}`].join("\n");
    const channels=[
      {provider:"feishu",url:text(Deno.env.get("FEISHU_WEBHOOK_URL"),1000),send:postFeishu},
      {provider:"dingtalk",url:text(Deno.env.get("DINGTALK_WEBHOOK_URL"),1000),send:postDingTalk},
    ].filter(channel=>channel.url);
    const results=await Promise.all(channels.map(async channel=>{try{await channel.send(channel.url,content);return{provider:channel.provider,sent:true}}catch(error){return{provider:channel.provider,sent:false,error:error instanceof Error?error.message:String(error)}}}));
    await admin.from("audit_logs").insert({actor_id:user.id,entity_type:"inquiry",entity_id:inquiry.id,action:"group_notification",after_data:{action,channels:results},reason:"询盘业务事件同步到已配置的群机器人"});
    const failed=results.filter(result=>!result.sent);if(failed.length)throw new Error(failed.map(result=>`${result.provider}: ${result.error}`).join("；"));
    return new Response(JSON.stringify({sent:results.filter(result=>result.sent).map(result=>result.provider),configured:channels.map(channel=>channel.provider)}),{headers:cors});
  }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:String(error)}),{status:400,headers:cors})}
});
