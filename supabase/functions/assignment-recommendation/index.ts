import { matchTerritory, resolveInquiryRegion } from "../_shared/sales-territory.mjs";
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

    const [salesResult,territoryResult]=await Promise.all([
      userDb.from("profiles").select("id,full_name,english_name,email,team,job_title").eq("role","sales").eq("active",true).order("full_name"),
      userDb.from("sales_target_people").select("profile_id,sales_region,job_title"),
    ]);
    if(salesResult.error||territoryResult.error)throw salesResult.error||territoryResult.error;
    const territoryRows=territoryResult.data||[];
    const candidates=(salesResult.data||[]).map(person=>{
      const configured=territoryRows.find(row=>row.profile_id===person.id);
      const territory=matchTerritory(inquiry.target_country,configured?.sales_region);
      return {sales_id:person.id,name:person.full_name,english_name:person.english_name||"",sales_region:configured?.sales_region||"",territory};
    }).sort((a,b)=>b.territory.rank-a.territory.rank||a.name.localeCompare(b.name,"zh-CN"));
    const top=candidates.filter(item=>item.territory.rank>0);
    const region=resolveInquiryRegion(inquiry.target_country);
    const confidence=0;
    const sourceHash=await sha256(JSON.stringify({schema_version:"assignment-region-only-v3",inquiry:{id:inquiry.id,country:inquiry.target_country,updated_at:inquiry.updated_at},candidates}));
    const {data:cached}=await admin.from("ai_suggestions").select("*").eq("suggestion_type","assignment_recommendation").eq("target_type","inquiry").eq("target_id",inquiry.id).eq("source_hash",sourceHash).eq("status","generated").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(cached)return json({suggestion:cached,cached:true});
    const proposedData={recommended_sales_id:top[0]?.sales_id||null,recommendations:top,inquiry_country:inquiry.target_country||"",inquiry_region:region,confidence_not_estimated:true,region_status:!region?"unknown_country":top.length?"matched":"no_matching_sales",candidate_territories:candidates.map(item=>({sales_id:item.sales_id,...item.territory})),candidate_count:candidates.length,scoring_version:"assignment-region-only-v3",guardrail:"仅供主管参考，不自动分配"};
    const evidence=top.map(item=>({sales_id:item.sales_id,sales_region:item.sales_region,territory:item.territory}));
    const rationale="仅依据询盘国家与已登记负责区域匹配，分区负责人优先于大区覆盖。同区域人员不评优劣，按姓名排列，最终由主管选择。";
    const {data:suggestionId,error:saveError}=await admin.rpc("record_ai_suggestion",{target_suggestion_type:"assignment_recommendation",target_target_type:"inquiry",target_target_id:inquiry.id,target_source_hash:sourceHash,target_provider:"rules",target_model:"assignment-region-only-v3",target_confidence:confidence,target_proposed_data:proposedData,target_evidence:evidence,target_rationale_zh:rationale,target_requested_by:user.id});
    if(saveError||!suggestionId)throw new Error(`分配建议保存失败：${saveError?.message||"未返回建议编号"}`);
    const {data:suggestion,error:readError}=await admin.from("ai_suggestions").select("*").eq("id",suggestionId).single();if(readError||!suggestion)throw readError||new Error("分配建议读取失败");
    return json({suggestion,cached:false});
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},400)}
}));

