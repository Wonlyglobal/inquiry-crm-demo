import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const defaultOrigins=["https://www.wonlyglobal.com","https://wonlyglobal.com","http://localhost:5173","http://localhost:4173"];
const allowedOrigins=()=>new Set((Deno.env.get("WEBSITE_INTAKE_ORIGINS")||defaultOrigins.join(",")).split(",").map(value=>value.trim()).filter(Boolean));
const corsFor=(request:Request)=>{
  const origin=request.headers.get("origin")||"";
  const headers:Record<string,string>={"content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin"};
  if(origin&&allowedOrigins().has(origin))headers["access-control-allow-origin"]=origin;
  return headers;
};
const json=(body:unknown,status=200,request?:Request)=>new Response(JSON.stringify(body),{
  status,headers:request?corsFor(request):{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
});
const emptyCors=(request:Request,status=204)=>new Response(null,{status,headers:{...corsFor(request),"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type, x-wonly-intake-secret, x-idempotency-key, apikey, authorization","access-control-max-age":"600"}});

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
  const origin=request.headers.get("origin")||"";
  if(origin&&!allowedOrigins().has(origin))return json({error:"Origin not allowed"},403,request);
  if(request.method==="OPTIONS")return emptyCors(request);
  if(request.method!=="POST")return json({error:"Method not allowed"},405,request);
  const configuredSecret=Deno.env.get("WEBSITE_INTAKE_SECRET")||"";
  const suppliedSecret=request.headers.get("x-wonly-intake-secret")||"";
  const authorization=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const suppliedPublicKey=request.headers.get("apikey")||authorization;
  // Supabase now exposes publishable keys as SUPABASE_PUBLISHABLE_KEY while
  // older projects still provide SUPABASE_ANON_KEY. Accept either server
  // variable, but never accept a client-supplied value as configuration.
  const configuredPublicKey=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY")||"";
  const hasServerCredential=Boolean(configuredSecret&&suppliedSecret&&await safeEqual(configuredSecret,suppliedSecret));
  const hasBrowserCredential=Boolean(origin&&configuredPublicKey&&suppliedPublicKey&&await safeEqual(configuredPublicKey,suppliedPublicKey));
  if(!hasServerCredential&&!hasBrowserCredential)return json({error:"Unauthorized"},401,request);

  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>128*1024)return json({error:"Payload too large"},413,request);

  let payload:Record<string,unknown>;
  try{
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>128*1024)return json({error:"Payload too large"},413,request);
    payload=JSON.parse(raw);
  }catch{return json({error:"Invalid JSON"},400,request)}
  const submissionId=String(payload.submission_id||request.headers.get("x-idempotency-key")||"").trim();
  if(!submissionId)return json({error:"submission_id is required"},400,request);
  payload.submission_id=submissionId;

  const url=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!serviceKey)return json({error:"Service configuration unavailable"},503,request);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc("ingest_website_inquiry",{payload});
  if(error)return json({status:"failed",submission_id:submissionId,error:"CRM intake failed"},503,request);
  if(data?.status==="failed")return json({status:"failed",submission_id:submissionId,error:data.error||"CRM intake failed"},503,request);
  return json(data,data?.status==="duplicate"?200:201,request);
});
