import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
});

const safeEqual=async(a:string,b:string)=>{
  const encoder=new TextEncoder();
  const [left,right]=await Promise.all([
    crypto.subtle.digest("SHA-256",encoder.encode(a)),
    crypto.subtle.digest("SHA-256",encoder.encode(b)),
  ]);
  const x=new Uint8Array(left),y=new Uint8Array(right);
  let difference=0;
  for(let i=0;i<x.length;i++)difference|=x[i]^y[i];
  return difference===0;
};

Deno.serve(async request=>{
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  const configuredSecret=Deno.env.get("WEBSITE_INTAKE_SECRET")||"";
  const suppliedSecret=request.headers.get("x-wonly-intake-secret")||"";
  if(!configuredSecret||!suppliedSecret||!(await safeEqual(configuredSecret,suppliedSecret))){
    return json({error:"Unauthorized"},401);
  }

  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>128*1024)return json({error:"Payload too large"},413);

  let payload:Record<string,unknown>;
  try{
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>128*1024)return json({error:"Payload too large"},413);
    payload=JSON.parse(raw);
  }catch{return json({error:"Invalid JSON"},400)}
  const submissionId=String(payload.submission_id||request.headers.get("x-idempotency-key")||"").trim();
  if(!submissionId)return json({error:"submission_id is required"},400);
  payload.submission_id=submissionId;

  const url=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!serviceKey)return json({error:"Service configuration unavailable"},503);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc("ingest_website_inquiry",{payload});
  if(error)return json({status:"failed",submission_id:submissionId,error:"CRM intake failed"},503);
  if(data?.status==="failed")return json({status:"failed",submission_id:submissionId,error:data.error||"CRM intake failed"},503);
  return json(data,data?.status==="duplicate"?200:201);
});
