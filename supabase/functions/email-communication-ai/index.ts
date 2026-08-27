import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Content-Type":"application/json"};
function envKey(grouped:string,standard:string){const value=Deno.env.get(grouped);if(value){try{return JSON.parse(value).default||""}catch{}}return Deno.env.get(standard)||""}
function clean(value:unknown,max=12000){return String(value||"").trim().slice(0,max)}
function jsonObject(text:string){const raw=text.replace(/^```json\s*|\s*```$/g,"").trim();return JSON.parse(raw)}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")||"";
    const secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(!secret||token!==secret)return new Response(JSON.stringify({error:"无权调用"}),{status:403,headers:cors});
    const apiKey=Deno.env.get("DEEPSEEK_API_KEY")||"";if(!apiKey)throw new Error("DeepSeek API Key 未配置");
    const {message_id}=await req.json();
    const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:message,error}=await db.from("email_messages").select("id,inquiry_id,direction,sender_email,recipient_emails,subject,body_text,received_at,sent_at,inquiries(title,product_category,quantity,target_country,status)").eq("id",message_id).single();
    if(error||!message?.inquiry_id)throw error||new Error("邮件尚未关联询盘");
    const response=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:Deno.env.get("DEEPSEEK_MODEL")||"deepseek-chat",temperature:0.1,max_tokens:900,response_format:{type:"json_object"},messages:[{role:"system",content:"你是WONLY海外门锁与门类业务CRM沟通分析员。只能依据邮件和询盘资料，不得把推测写成事实。输出严格JSON：summary_zh、latest_customer_request、objections、commitments、risks、recommended_next_step。中文简洁总结；缺失项用空字符串。内部风险判断绝不能写进给客户的邮件。"},{role:"user",content:`询盘：${JSON.stringify(message.inquiries)}\n方向：${message.direction}\n主题：${clean(message.subject,500)}\n正文：${clean(message.body_text,10000)}`}]}),signal:AbortSignal.timeout(25000)});
    const payload=await response.json();if(!response.ok)throw new Error(payload?.error?.message||`DeepSeek ${response.status}`);
    const result=jsonObject(clean(payload?.choices?.[0]?.message?.content));
    const record={inquiry_id:message.inquiry_id,source_message_id:message.id,summary_zh:clean(result.summary_zh,4000)||"暂未生成有效总结",latest_customer_request:clean(result.latest_customer_request,4000)||null,objections:clean(result.objections,3000)||null,commitments:clean(result.commitments,3000)||null,risks:clean(result.risks,3000)||null,recommended_next_step:clean(result.recommended_next_step,3000)||null,provider:"deepseek"};
    await db.from("communication_summaries").delete().eq("source_message_id",message.id);
    const saved=await db.from("communication_summaries").insert(record);if(saved.error)throw saved.error;
    return new Response(JSON.stringify({summarized:true}),{headers:cors});
  }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:String(error)}),{status:400,headers:cors})}
});
