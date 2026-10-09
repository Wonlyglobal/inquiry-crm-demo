import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-internal-worker-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const clean=(value:unknown,max=12000)=>String(value??"").trim().slice(0,max);
function envKey(grouped:string,standard:string){const value=Deno.env.get(grouped);if(value){try{return JSON.parse(value).default||""}catch{}}return Deno.env.get(standard)||""}
const sha256=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,"0")).join("");
function sameSecret(a:string,b:string){if(!a||!b)return false;let diff=a.length^b.length;const size=Math.max(a.length,b.length);for(let i=0;i<size;i++)diff|=(a.charCodeAt(i%a.length)||0)^(b.charCodeAt(i%b.length)||0);return diff===0}
function inPeriod(item:any,start:string,end:string){const time=item.direction==="inbound"?item.received_at:item.sent_at;const stamp=Date.parse(String(time||""));return Number.isFinite(stamp)&&stamp>=Date.parse(start)&&stamp<Date.parse(end)}
function monthBounds(periodStart:string){if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(periodStart))throw new Error("统计周期必须是有效月份的第一天");const [year,month]=periodStart.split("-").map(Number);const next=new Date(Date.UTC(year,month,1));if(periodStart>new Date().toISOString().slice(0,7)+"-01")throw new Error("不能分析未来月份");return {start:`${periodStart}T00:00:00+08:00`,end:`${next.toISOString().slice(0,10)}T00:00:00+08:00`}}
function noScoreFields(value:any){const banned=/score|rank|rating|grade|points|ranking/i;return value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).every(key=>!banned.test(key))}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")||"",serviceKey=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const bridgeSecret=Deno.env.get("SALES_EMAIL_ANALYSIS_BRIDGE_TOKEN")||"";
    if(!url||!serviceKey||!bridgeSecret)return json({error:"service_unavailable"},503);
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const body=await req.json();
    const workerToken=req.headers.get("x-internal-worker-token")||"";

    if(body?.action==="poll"||body?.action==="complete"||body?.action==="fail"){
      if(!sameSecret(workerToken,bridgeSecret))return json({error:"unauthorized"},401);
      if(body.action==="poll"){
        const {data:job,error:claimError}=await admin.rpc("claim_sales_email_analysis_job");
        if(claimError)throw claimError;
        if(!job?.id)return json({job:null});
        const source=await loadSource(admin,job.inquiry_id,job.salesperson_id,job.period_start);
        if(!source||source.source_hash!==job.source_hash){await admin.from("sales_email_analysis_jobs").update({status:"failed",failure_code:"source_changed"}).eq("id",job.id);return json({job:null});}
        return json({job:{id:job.id,inquiry_id:job.inquiry_id,salesperson_id:job.salesperson_id,period_start:job.period_start,source_hash:job.source_hash,messages:source.messages}});
      }
      const jobId=clean(body.job_id,80);
      const {data:job,error:jobError}=await admin.from("sales_email_analysis_jobs").select("id,inquiry_id,salesperson_id,period_start,source_hash,status").eq("id",jobId).maybeSingle();
      if(jobError||!job||job.status!=="processing")return json({error:"job_unavailable"},409);
      if(body.action==="fail"){
        const allowed=["model_unavailable","model_invalid_output","processing_error"];
        const code=allowed.includes(body.failure_code)?body.failure_code:"processing_error";
        const {error}=await admin.from("sales_email_analysis_jobs").update({status:"failed",failure_code:code}).eq("id",job.id).eq("status","processing");
        if(error)throw error;return json({ok:true});
      }
      const source=await loadSource(admin,job.inquiry_id,job.salesperson_id,job.period_start);
      if(!source||source.source_hash!==job.source_hash){await admin.from("sales_email_analysis_jobs").update({status:"failed",failure_code:"source_changed"}).eq("id",job.id);return json({error:"source_changed"},409);}
      const analysis=body.analysis,evidence=body.evidence,confidence=Number(body.confidence),model=clean(body.model,120);
      if(!noScoreFields(analysis)||!Array.isArray(evidence)||evidence.length<1||evidence.length>30||!Number.isFinite(confidence)||confidence<0||confidence>1||!model) return json({error:"invalid_analysis"},400);
      const sourceById=new Map(source.messages.map((message:any)=>[message.id,message.body_text]));
      for(const item of evidence){if(!item||!sourceById.has(item.message_id)||!clean(item.quote,240)||!String(sourceById.get(item.message_id)||"").includes(item.quote))return json({error:"evidence_not_in_source"},400);}
      const result={overall_observation:clean(analysis.overall_observation,1200),strengths:Array.isArray(analysis.strengths)?analysis.strengths.slice(0,8).map((x:any)=>clean(x,600)):[],improvements:Array.isArray(analysis.improvements)?analysis.improvements.slice(0,8).map((x:any)=>clean(x,600)):[],missing_context:Array.isArray(analysis.missing_context)?analysis.missing_context.slice(0,8).map((x:any)=>clean(x,400)):[]};
      if(!result.overall_observation)return json({error:"invalid_analysis"},400);
      const {error:saveError}=await admin.from("sales_email_analysis_results").insert({job_id:job.id,inquiry_id:job.inquiry_id,salesperson_id:job.salesperson_id,period_start:job.period_start,source_hash:job.source_hash,provider:"company_internal_ollama",model,confidence,analysis:result,evidence:evidence.map((x:any)=>({message_id:x.message_id,dimension:clean(x.dimension,80),quote:clean(x.quote,240),message_direction:source.messages.find((m:any)=>m.id===x.message_id)?.direction||null}))});
      if(saveError&&saveError.code!=="23505")throw saveError;
      const {error:updateError}=await admin.from("sales_email_analysis_jobs").update({status:"completed",completed_at:new Date().toISOString(),failure_code:null}).eq("id",job.id).eq("status","processing");
      if(updateError)throw updateError;
      await admin.from("audit_logs").insert({actor_id:job.requested_by,entity_type:"inquiry",entity_id:job.inquiry_id,action:"sales_email_body_analysis_generated",after_data:{job_id:job.id,salesperson_id:job.salesperson_id,provider:"company_internal_ollama",model,confidence,evidence_count:evidence.length,source_hash:job.source_hash},reason:"内网模型生成仅供人工判断的邮件正文观察，未调整评分或排名"});
      return json({ok:true});
    }

    const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(!token)return json({error:"unauthorized"},401);
    const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";if(!anon)return json({error:"auth_unavailable"},503);
    const userDb=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userDb.auth.getUser(token);if(userError||!user)return json({error:"session_invalid"},401);
    if(body?.action!=="request")return json({error:"unsupported_action"},400);
    const salespersonId=clean(body.salesperson_id,80),periodStart=clean(body.period_start,10),{start,end}=monthBounds(periodStart);
    const {data:actor,error:actorError}=await admin.from("profiles").select("id,role,team,active").eq("id",user.id).maybeSingle();
    if(actorError||!actor?.active)return json({error:"account_inactive"},403);
    const {data:sales,error:salesError}=await admin.from("profiles").select("id,team,active").eq("id",salespersonId).eq("role","sales").eq("active",true).maybeSingle();
    if(salesError||!sales)return json({error:"salesperson_unavailable"},404);
    if(actor.role==="sales"&&actor.id!==sales.id)return json({error:"forbidden"},403);
    if(actor.role==="sales_manager"&&actor.team!==sales.team)return json({error:"forbidden"},403);
    if(!["owner","sales_manager","sales"].includes(actor.role))return json({error:"forbidden"},403);
    const sourceInquiries=await loadCandidateInquiries(admin,sales.id,start,end);
    if(sourceInquiries.error)throw sourceInquiries.error;
    if(sourceInquiries.tooLarge||sourceInquiries.items.length>250)return json({error:"period_too_large",hint:"请按月分开整理"},413);
    const jobs=[];
    for(const item of sourceInquiries.items){
      const source=await loadSource(admin,item.id,sales.id,periodStart);
      if(!source||!source.messages.some((m:any)=>m.direction==="inbound")||!source.messages.some((m:any)=>m.direction==="outbound"))continue;
      const {data,error}=await admin.rpc("enqueue_sales_email_analysis_job",{target_inquiry_id:item.id,target_salesperson_id:sales.id,target_requested_by:user.id,target_period_start:periodStart,target_source_hash:source.source_hash});
      if(error)throw error;if(data)jobs.push(data);
    }
    await admin.from("audit_logs").insert({actor_id:user.id,entity_type:"profile",entity_id:sales.id,action:"sales_email_body_analysis_requested",after_data:{period_start:periodStart,queued_count:jobs.length},reason:"经授权的人工触发邮件正文分析；限本人/授权团队，结果不影响评分或排名"});
    return json({queued:jobs.length,period_start:periodStart,salesperson_id:sales.id,scoring_effect:false});
  }catch(error){console.error("sales-email-body-analysis failed",error instanceof Error?error.name:"unknown");return json({error:"analysis_request_failed"},400);}
});

async function loadCandidateInquiries(admin:any,salespersonId:string,start:string,end:string){
  const {data:boxes,error:boxError}=await admin.from("mailbox_connections").select("id").eq("user_id",salespersonId).eq("mailbox_kind","personal");
  if(boxError)return {items:[],error:boxError};if(!boxes?.length)return {items:[],error:null};
  const {data:inquiries,error}=await admin.from("inquiries").select("id").eq("owner_id",salespersonId).eq("validity","valid").eq("excluded_from_dashboard",false).limit(501);
  if(error)return {items:[],error};if(!inquiries?.length)return {items:[],error:null};
  if(inquiries.length>500)return {items:[],error:null,tooLarge:true};
  const {data:messages,error:messageError}=await admin.from("email_messages").select("inquiry_id,id,direction,sent_at,received_at").in("mailbox_connection_id",boxes.map((x:any)=>x.id)).in("inquiry_id",inquiries.map((x:any)=>x.id)).eq("association_status","matched").limit(5001);
  if(messageError)return {items:[],error:messageError};if((messages||[]).length>5000)return {items:[],error:null,tooLarge:true};
  const allowed=new Set(inquiries.map((x:any)=>x.id)),ids=new Set((messages||[]).filter((m:any)=>allowed.has(m.inquiry_id)&&inPeriod(m,start,end)).map((m:any)=>m.inquiry_id));
  return {items:[...ids].map(id=>({id})),error:null};
}

async function loadSource(admin:any,inquiryId:string,salespersonId:string,periodStart:string){
  const {start,end}=monthBounds(periodStart);
  const [{data:inquiry,error:inquiryError},{data:boxes,error:boxError}]=await Promise.all([
    admin.from("inquiries").select("id,owner_id,validity,excluded_from_dashboard").eq("id",inquiryId).maybeSingle(),
    admin.from("mailbox_connections").select("id").eq("user_id",salespersonId).eq("mailbox_kind","personal"),
  ]);
  if(inquiryError||boxError||!inquiry||inquiry.owner_id!==salespersonId||inquiry.validity!=="valid"||inquiry.excluded_from_dashboard||!boxes?.length)return null;
  const periodFilter=`and(direction.eq.inbound,received_at.gte.${start},received_at.lt.${end}),and(direction.eq.outbound,sent_at.gte.${start},sent_at.lt.${end})`;
  const {data:rows,error}=await admin.from("email_messages").select("id,inquiry_id,direction,subject,body_text,sent_at,received_at,association_status,mailbox_connection_id").eq("inquiry_id",inquiryId).in("mailbox_connection_id",boxes.map((x:any)=>x.id)).eq("association_status","matched").in("direction",["inbound","outbound"]).or(periodFilter).order("created_at",{ascending:true}).limit(301);
  if(error)throw error;
  const messages=(rows||[]).filter((m:any)=>inPeriod(m,start,end)&&clean(m.body_text,12000)).map((m:any)=>({id:m.id,direction:m.direction,subject:clean(m.subject,300),body_text:clean(m.body_text,12000),occurred_at:m.direction==="inbound"?m.received_at:m.sent_at}));
  if(!messages.length||messages.length>300||messages.reduce((n:number,m:any)=>n+m.body_text.length,0)>180000)return null;
  const source_hash=await sha256(messages.map((m:any)=>`${m.id}|${m.direction}|${m.occurred_at}|${m.subject}|${m.body_text}`).join("\n"));
  return {messages,source_hash};
}
