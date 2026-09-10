import {createClient} from "npm:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const clean=(value:unknown,max=6000)=>String(value||"").trim().slice(0,max);
const envKey=(grouped:string,standard:string)=>{const value=Deno.env.get(grouped);if(value){try{return JSON.parse(value).default||""}catch{}}return Deno.env.get(standard)||""};

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY"),token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(!url||!anon||!secret||!token)return reply({error:"无权调用"},403);
    const userDb=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}}),{data:{user},error:userError}=await userDb.auth.getUser(token);
    if(userError||!user)return reply({error:"登录已失效"},401);
    const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),{data:profile}=await db.from("profiles").select("id,full_name,role,active").eq("id",user.id).single();
    if(!profile?.active||profile.role!=="sales")return reply({error:"仅业务员可生成个人日报"},403);
    const input=await req.json(),date=clean(input?.report_date,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("日报日期无效");
    const start=`${date}T00:00:00+08:00`,next=new Date(start);next.setUTCDate(next.getUTCDate()+1);
    const [{data:plans,error:planError},{data:follows,error:followError},{data:leads,error:leadError}]=await Promise.all([
      db.from("sales_daily_plans").select("plan_date,planned_at,title,priority,key_result,completed_at,inquiries(inquiry_no,title)").eq("owner_id",user.id).eq("plan_date",date).order("planned_at"),
      db.from("follow_ups").select("method,content,customer_feedback,next_follow_up_at,completed_at,completion_status,inquiries(inquiry_no,title)").eq("author_id",user.id).gte("created_at",start).lt("created_at",next.toISOString()).order("created_at"),
      db.from("inquiries").select("inquiry_no,title,status,target_country").eq("created_by",user.id).eq("excluded_from_dashboard",false).gte("created_at",start).lt("created_at",next.toISOString()).order("created_at"),
    ]);
    if(planError||followError||leadError)throw planError||followError||leadError;
    const apiKey=Deno.env.get("DEEPSEEK_API_KEY")||"";if(!apiKey)throw new Error("DeepSeek API Key 未配置");
    const source={date,salesperson:profile.full_name,daily_plans:plans||[],follow_up_records:follows||[],new_leads:leads||[]};
    const ai=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:Deno.env.get("DEEPSEEK_MODEL")||"deepseek-chat",temperature:.1,max_tokens:1400,response_format:{type:"json_object"},messages:[{role:"system",content:"你是外贸销售日报助手。只根据提供的 CRM 事实生成简洁中文日报草稿，不得编造客户回复、结果、金额或承诺。已完成计划的关键成果放入关键进展；未完成、逾期和没有结果的事项如实放入困难；次日仍需推进的事项形成明日计划。不要输出 Markdown，不要使用星号。严格返回 JSON：key_progress、blockers、tomorrow_plan。每个字段使用短句分行。"},{role:"user",content:JSON.stringify(source)}]}),signal:AbortSignal.timeout(40000)});
    const payload=await ai.json();if(!ai.ok)throw new Error(payload?.error?.message||`DeepSeek ${ai.status}`);
    const result=JSON.parse(clean(payload?.choices?.[0]?.message?.content,12000).replace(/^```json\s*|\s*```$/g,""));
    return reply({draft:{key_progress:clean(result.key_progress),blockers:clean(result.blockers),tomorrow_plan:clean(result.tomorrow_plan)},source_counts:{plans:(plans||[]).length,follow_ups:(follows||[]).length,new_leads:(leads||[]).length}});
  }catch(error){return reply({error:error instanceof Error?error.message:String(error)},400)}
});
