import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {normalizeSubmission} from './payload.mjs';
const origins=new Set(['https://crm.foreverdoodle.com','https://business.foreverdoodle.com']);
Deno.serve(async(req)=>{
 const origin=req.headers.get('origin')||'';
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info';
 headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS';
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.has(origin))return respond({error:'origin_denied'},403);
 if(req.method==='OPTIONS')return respond({ok:true});
 if(!['GET','POST'].includes(req.method))return respond({error:'method_not_allowed'},405);
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 try{
  if(req.method==='GET'){
   const url=new URL(req.url),domain=url.searchParams.get('domain'),offset=Number(url.searchParams.get('offset')||0);
   if(!Number.isSafeInteger(offset)||offset<0||offset>50000)return respond({error:'invalid_offset'},400);
   let query=admin.from('business_public_companies').select('domain,version,payload,updated_at').order('domain').range(offset,offset+499);
   if(domain)query=query.eq('domain',domain);
   const {data,error}=await query;if(error)throw Error('read_failed');
   return respond({schema:'business-public-research-v1',companies:data||[],next_offset:data?.length===500?offset+500:null});
  }
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
  if(!token)return respond({error:'authentication_required'},401);
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return respond({error:'authentication_required'},401);
  if(user.email?.toLowerCase()!=='chloelee@wonlyglobal.com')return respond({error:'business_owner_required'},403);
  const {data:profile}=await admin.from('profiles').select('active').eq('id',user.id).maybeSingle();
  if(!profile?.active)return respond({error:'business_owner_required'},403);
  const reader=req.body?.getReader();let size=0;const chunks=[];
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>60000){await reader.cancel();return respond({error:'payload_too_large'},413)}chunks.push(value)}
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length}
  const raw=new TextDecoder().decode(bytes);
  let submission;try{submission=normalizeSubmission(JSON.parse(raw))}catch(e){return respond({error:e instanceof Error?e.message:'invalid_submission'},400)}
  const {data,error}=await admin.rpc('save_business_public_research',{p_actor:user.id,p_domain:submission.domain,p_payload:submission.payload,p_expected:submission.expected_version,p_request:submission.request_id});
  if(error)return respond({error:/version_conflict|idempotency_conflict|historical_evidence/.test(error.message)?'conflict_refresh_required':'save_rejected'},409);
  const {data:readback,error:readError}=await admin.from('business_public_research_versions').select('domain,version,payload').eq('domain',submission.domain).eq('version',data.version).maybeSingle();
  if(readError||!readback||JSON.stringify(readback.payload)!==JSON.stringify(submission.payload)){
   // JSONB key order differs; compare canonical sorted keys instead of treating a committed write as failed.
   const canonical=(v:unknown):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
   if(readError||!readback||canonical(readback.payload)!==canonical(submission.payload))return respond({error:'readback_unconfirmed',request_id:submission.request_id},503);
  }
  return respond({...data,readback_verified:true});
 }catch{return respond({error:'business_service_unavailable'},503)}
});
