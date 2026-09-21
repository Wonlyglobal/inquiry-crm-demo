import { matchTerritory, resolveInquiryRegion, rankTerritoryCandidates } from "../_shared/sales-territory.mjs";
import { withReadOnlyGuard } from "../_shared/read-only.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
function envKey(grouped:string,standard:string){const value=Deno.env.get(grouped);if(value){try{return JSON.parse(value).default||""}catch{}}return Deno.env.get(standard)||""}
function clean(value:unknown,max=400){return String(value||"").trim().slice(0,max)}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors})}
function norm(value:unknown){return clean(value,300).toLocaleLowerCase().replace(/\s+/g," ")}
async function sha256(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}

Deno.serve(withReadOnlyGuard(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")||"",anon=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY"),authorization=req.headers.get("Authorization")||"";
    if(!url||!anon||!secret||!authorization)return json({error:"无权调用"},403);
    const userDb=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userDb.auth.getUser();if(userError||!user)return json({error:"登录已失效"},401);
    const {data:profile,error:profileError}=await userDb.from("profiles").select("id,role,active").eq("id",user.id).single();
    if(profileError||!profile?.active||!["owner","sales_manager"].includes(profile.role))return json({error:"仅老板或销售主管可生成分配推荐"},403);
    const input=await req.json(),inquiryId=clean(input?.inquiry_id,80);if(!inquiryId)return json({error:"缺少询盘编号"},400);
    const {data:inquiry,error:inquiryError}=await userDb.from("inquiries").select("id,inquiry_no,title,target_country,product_category,company_id,validity,status,owner_id,updated_at").eq("id",inquiryId).single();
    if(inquiryError||!inquiry)return json({error:"询盘不存在或无权查看"},404);
    if(inquiry.validity!=="valid"||inquiry.owner_id||inquiry.status!=="pending_assignment")return json({error:"仅可为有效且待分配的询盘生成推荐"},400);

    const [salesResult,historyResult,reminderResult,territoryResult]=await Promise.all([
      admin.from("profiles").select("id,full_name,english_name,email,team,job_title").eq("role","sales").eq("active",true).order("full_name"),
      admin.from("inquiries").select("id,owner_id,target_country,product_category,company_id,validity,status,assigned_at,first_valid_contact_at,created_at").not("owner_id","is",null).eq("excluded_from_dashboard",false).limit(5000),
      admin.from("email_reply_reminders").select("owner_id,status").eq("status","open").limit(5000),
      userDb.from("sales_target_people").select("profile_id,sales_region,job_title"),
    ]);
    const dataError=salesResult.error||historyResult.error||reminderResult.error||territoryResult.error;if(dataError)throw dataError;
    const sales=salesResult.data||[],history=historyResult.data||[],reminders=reminderResult.data||[];
    if(!sales.length)return json({error:"当前没有可分配的在职业务员"},400);
    const country=norm(inquiry.target_country),product=norm(inquiry.product_category),now=Date.now();
    const territoryRows=territoryResult.data||[];
    const candidates=rankTerritoryCandidates(sales.map(person=>{
      const configured=territoryRows.find(row=>row.profile_id===person.id);
      const territory=matchTerritory(inquiry.target_country,configured?.sales_region);
      const owned=history.filter(item=>item.owner_id===person.id),open=owned.filter(item=>item.validity==="valid"&&!['won','lost'].includes(item.status)),countryCount=country?owned.filter(item=>norm(item.target_country)===country).length:0,productCount=product?owned.filter(item=>norm(item.product_category)===product).length:0,companyCount=inquiry.company_id?owned.filter(item=>item.company_id===inquiry.company_id).length:0,pendingReplies=reminders.filter(item=>item.owner_id===person.id).length;
      const eligible=owned.filter(item=>item.assigned_at&&item.first_valid_contact_at&&new Date(item.first_valid_contact_at).getTime()>=new Date(item.assigned_at).getTime()),onTime=eligible.filter(item=>new Date(item.first_valid_contact_at).getTime()-new Date(item.assigned_at).getTime()<=30*60000).length,slaRate=eligible.length?onTime/eligible.length:null;
      const countryScore=territory.rank===2?20:territory.rank===1?10:0,productScore=Math.min(25,productCount*5),capacityScore=Math.max(0,25-open.length*3-pendingReplies*4),slaScore=slaRate===null?10:Math.round(slaRate*20),continuityScore=companyCount?10:0,total=Math.max(0,Math.min(100,countryScore+productScore+capacityScore+slaScore+continuityScore));
      const warnings=[] as string[];if(territory.rank===0)warnings.push(territory.label);if(open.length>=8)warnings.push(`在手有效询盘较多（${open.length} 条）`);if(pendingReplies>=3)warnings.push(`客户待回复较多（${pendingReplies} 条）`);if(!country&&!product)warnings.push("询盘缺少国家和产品信息，匹配依据有限");
      return {sales_id:person.id,name:person.full_name,english_name:person.english_name||"",sales_region:configured?.sales_region||"",territory,email:person.email,team:person.team||"",job_title:person.job_title||"",score:total,breakdown:{country:{score:countryScore,max:20,count:countryCount,label:territory.label},product:{score:productScore,max:25,count:productCount,label:product?`${inquiry.product_category} 历史经验`:`产品信息缺失`},capacity:{score:capacityScore,max:25,open_inquiries:open.length,pending_replies:pendingReplies,label:"当前负荷"},sla:{score:slaScore,max:20,sample_size:eligible.length,on_time_count:onTime,rate:slaRate,label:"30 分钟首响"},continuity:{score:continuityScore,max:10,count:companyCount,label:"同客户连续性"}},warnings,last_activity_at:owned.map(item=>item.first_valid_contact_at||item.assigned_at||item.created_at).filter(Boolean).sort().at(-1)||null};
    }));
    const matched=candidates.filter(item=>item.territory.rank>0),top=matched.slice(0,3);
    const region=resolveInquiryRegion(inquiry.target_country);
    // Required legacy field; no calibrated probability is estimated for deterministic routing.
    const confidence=0;
    const sourceHash=await sha256(JSON.stringify({schema_version:"assignment-territory-v2",inquiry:{id:inquiry.id,country,product,company_id:inquiry.company_id,updated_at:inquiry.updated_at},candidates:candidates.map(item=>[item.sales_id,item.name,item.english_name,item.sales_region,item.territory,item.score,item.breakdown])}));
    const {data:cached}=await admin.from("ai_suggestions").select("*").eq("suggestion_type","assignment_recommendation").eq("target_type","inquiry").eq("target_id",inquiry.id).eq("source_hash",sourceHash).eq("status","generated").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(cached)return json({suggestion:cached,cached:true});
    const proposedData={recommended_sales_id:top[0]?.sales_id||null,recommendations:top,inquiry_country:inquiry.target_country||"",inquiry_region:region,confidence_not_estimated:true,region_status:!region?"unknown_country":matched.length?"matched":"no_matching_sales",candidate_territories:candidates.map(item=>({sales_id:item.sales_id,...item.territory})),candidate_count:candidates.length,scoring_version:"assignment-territory-v2",weights:{product:25,country:20,capacity:25,sla:20,continuity:10},guardrail:"仅供主管参考，不自动分配"},evidence=top.map(item=>({sales_id:item.sales_id,score:item.score,breakdown:item.breakdown,warnings:item.warnings}));
    const rationale=`先按询盘国家与已登记负责区域匹配（分区负责人优先于大区覆盖），再依据产品经验、当前在手询盘、待回复数量、30 分钟首响表现和同客户连续性进行可解释评分。统计截止 ${new Date(now).toISOString()}，不使用黑箱成交概率，最终分配仍由主管确认。`;
    const {data:suggestionId,error:saveError}=await admin.rpc("record_ai_suggestion",{target_suggestion_type:"assignment_recommendation",target_target_type:"inquiry",target_target_id:inquiry.id,target_source_hash:sourceHash,target_provider:"rules",target_model:"assignment-territory-v2",target_confidence:confidence,target_proposed_data:proposedData,target_evidence:evidence,target_rationale_zh:rationale,target_requested_by:user.id});
    if(saveError||!suggestionId)throw new Error(`分配建议保存失败：${saveError?.message||"未返回建议编号"}`);
    const {data:suggestion,error:readError}=await admin.from("ai_suggestions").select("*").eq("id",suggestionId).single();if(readError||!suggestion)throw readError||new Error("分配建议读取失败");
    return json({suggestion,cached:false});
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},400)}
}));

