import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
function envKey(grouped:string,standard:string){const value=Deno.env.get(grouped);if(value){try{return JSON.parse(value).default||""}catch{}}return Deno.env.get(standard)||""}
function clean(value:unknown,max=12000){return String(value||"").trim().slice(0,max)}
function jsonObject(text:string){const raw=text.replace(/^```json\s*|\s*```$/g,"").trim();return JSON.parse(raw)}
function safeDate(value:unknown){const date=new Date(String(value||""));return Number.isFinite(date.getTime())&&date.getTime()>Date.now()-3600000&&date.getTime()<Date.now()+90*86400000?date.toISOString():null}
async function loadCompleteThread(db:any,inquiryId:string){
  const pageSize=500,all:any[]=[];
  for(let from=0;;from+=pageSize){
    const {data,error}=await db.from("email_messages").select("id,direction,sender_email,recipient_emails,subject,body_text,received_at,sent_at,created_at").eq("inquiry_id",inquiryId).order("created_at",{ascending:true}).range(from,from+pageSize-1);
    if(error)throw error;
    all.push(...(data||[]));
    if((data||[]).length<pageSize)break;
  }
  if(all.length)return all;
  const {data:intakes,error:intakeError}=await db.from("email_intake").select("sender_email,recipient_email,subject,body_text,received_at,created_at").eq("inquiry_id",inquiryId).order("created_at",{ascending:true});
  if(intakeError)throw intakeError;
  return (intakes||[]).map((item:any)=>({id:null,direction:"inbound",sender_email:item.sender_email,recipient_emails:item.recipient_email?[item.recipient_email]:[],subject:item.subject,body_text:item.body_text,received_at:item.received_at,created_at:item.created_at}));
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")||"";
    const secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(!secret||!token)return new Response(JSON.stringify({error:"无权调用"}),{status:403,headers:cors});
    const apiKey=Deno.env.get("DEEPSEEK_API_KEY")||"";if(!apiKey)throw new Error("DeepSeek API Key 未配置");
    const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const body=await req.json();let inquiryId=clean(body?.inquiry_id,80),sourceMessageId=clean(body?.message_id,80),generationTrigger=clean(body?.trigger,30);
    if(!["mail_sync","manual","automatic_refresh"].includes(generationTrigger))generationTrigger=sourceMessageId?"mail_sync":"manual";
    if(sourceMessageId){const {data:source,error}=await db.from("email_messages").select("id,inquiry_id").eq("id",sourceMessageId).single();if(error||!source?.inquiry_id)throw error||new Error("邮件尚未关联询盘");inquiryId=source.inquiry_id}
    if(!inquiryId)throw new Error("缺少询盘编号");
    if(token!==secret){
      const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";if(!anon)return new Response(JSON.stringify({error:"身份验证配置缺失"}),{status:500,headers:cors});
      const userDb=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:{user},error:userError}=await userDb.auth.getUser(token);if(userError||!user)return new Response(JSON.stringify({error:"登录已失效"}),{status:401,headers:cors});
      const visible=await userDb.from("inquiries").select("id").eq("id",inquiryId).maybeSingle();if(visible.error||!visible.data)return new Response(JSON.stringify({error:"无权查看该询盘"}),{status:403,headers:cors});
    }
    const [{data:inquiry,error:inquiryError},thread]=await Promise.all([
      db.from("inquiries").select("id,title,product_category,quantity,target_country,status,demand_summary,project_name,contact_name,company_id").eq("id",inquiryId).single(),
      loadCompleteThread(db,inquiryId),
    ]);
    if(inquiryError||!inquiry)throw inquiryError||new Error("询盘不存在");if(!thread.length)throw new Error("当前询盘尚无可总结的收发邮件");
    let company=null;if(inquiry.company_id){const companyResult=await db.from("companies").select("name,domain,country,company_type,main_business,ai_summary,research_sales_brief").eq("id",inquiry.company_id).maybeSingle();company=companyResult.data||null}
    const chronological=thread,latest=thread[thread.length-1];sourceMessageId=latest.id||"";
    const perMessageChars=Math.max(320,Math.min(2600,Math.floor(70000/chronological.length)));
    const emailHistory=chronological.map((message,index)=>`[${index+1}] ${message.direction==="inbound"?"客户来信":"我方发信"}｜${message.received_at||message.sent_at||message.created_at}\n主题：${clean(message.subject,300)||"无主题"}\n正文：${clean(message.body_text,perMessageChars)||"（无正文）"}`).join("\n\n");
    const systemPrompt=`你是 WONLY 海外门锁与门类业务 CRM 的客户跟进分析员。你必须真正理解整段往来，而不是复述或把公司背调机械插入。只依据给定材料：区分客户明确说过的事实、我方承诺、尚未确认的信息和合理建议；不得编造客户痛点、预算、数量、认证、交期或决策权。重点识别客户当下阻碍采购决策的痛点、最新问题、隐含顾虑、我方尚未兑现的承诺，并提出一个低阻力的下一步。输出严格 JSON，字段为 summary_zh、customer_needs_pain_points、confirmed_items、pending_items、objections、commitments、risks、recommended_next_step、recommended_follow_up_at。各文本字段用简洁中文；无证据时明确写“暂无明确证据”而非猜测。recommended_follow_up_at 使用 ISO 8601；客户明确要求时间时优先，否则按紧急度建议未来 1–7 天。`;
    const response=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:Deno.env.get("DEEPSEEK_MODEL")||"deepseek-chat",temperature:0.1,max_tokens:1800,response_format:{type:"json_object"},messages:[{role:"system",content:systemPrompt},{role:"user",content:`当前时间：${new Date().toISOString()}\n询盘资料：${JSON.stringify(inquiry)}\n客户背调（只可作为背景，不得冒充客户表述）：${JSON.stringify(company)}\n\n全部邮件（按时间正序，共 ${chronological.length} 封）：\n${emailHistory}`}]}),signal:AbortSignal.timeout(40000)});
    const payload=await response.json();if(!response.ok)throw new Error(payload?.error?.message||`DeepSeek ${response.status}`);
    const result=jsonObject(clean(payload?.choices?.[0]?.message?.content));
    const record={inquiry_id:inquiryId,source_message_id:sourceMessageId||null,summary_zh:clean(result.summary_zh,4000)||"暂未生成有效总结",latest_customer_request:clean(result.customer_needs_pain_points,4000)||"暂无明确证据",confirmed_items:clean(result.confirmed_items,4000)||"暂无明确证据",pending_items:clean(result.pending_items,4000)||"暂无明确证据",objections:clean(result.objections,3000)||"暂无明确证据",commitments:clean(result.commitments,3000)||"暂无明确证据",risks:clean(result.risks,3000)||"暂无明确证据",recommended_next_step:clean(result.recommended_next_step,3000)||"核对客户最新问题并安排下一次联系",recommended_follow_up_at:safeDate(result.recommended_follow_up_at),summary_scope:"thread",message_count:chronological.length,provider:"deepseek",generation_trigger:generationTrigger};
    const saved=await db.from("communication_summaries").insert(record);if(saved.error)throw saved.error;
    return new Response(JSON.stringify({summarized:true,summary:record}),{headers:cors});
  }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:String(error)}),{status:400,headers:cors})}
});
