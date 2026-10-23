// Internal read-only acceptance endpoint. Original owner JWT/RLS and original signed material gateway.
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {eligible,validateDialogue} from '../agent-conversation/policy.mjs';
import {privateReportQuestion} from '../agent-conversation/private-report-context.mjs';
import {readPrivateIntelligence} from '../agent-conversation/private-intelligence.mjs';
import {existingVideoIntent} from '../agent-conversation/social-video-existing.mjs';
import {boundedBytes} from '../agent-conversation/bailian.mjs';
const cors={'Access-Control-Allow-Origin':'https://crm.foreverdoodle.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
const envKey=()=>{try{return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')||''}catch{return Deno.env.get('SUPABASE_ANON_KEY')||''}};
Deno.serve(async req=>{
 if(req.headers.get('origin')&&req.headers.get('origin')!=='https://crm.foreverdoodle.com')return json({error:'来源不允许'},403);
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({error:'仅支持POST'},405);
 try{
  const authorization=req.headers.get('authorization')||'',client=createClient(Deno.env.get('SUPABASE_URL')||'',envKey(),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)return json({error:'请重新登录'},401);
  const {data:profile}=await client.from('profiles').select('active,role').eq('id',user.id).single();if(!eligible(user,profile))return json({error:'当前账号未获授权'},403);
  const bytes=await boundedBytes(new Response(req.body),65536),input=JSON.parse(new TextDecoder().decode(bytes));validateDialogue(input);
  const q=privateReportQuestion(input.question,input.privateReportKey);if(input.action!=='chat'||input.voice===true||!existingVideoIntent(q))return json({error:'此预览仅接受内部视频文字复盘'},400);
  const materialConfig={actor:user.id,privateJwk:Deno.env.get('MATERIAL_SIGNING_PRIVATE_JWK'),serviceUrl:Deno.env.get('MATERIAL_LIBRARY_URL'),secret:Deno.env.get('MATERIAL_LIBRARY_SECRET')};
  const result=await readPrivateIntelligence(client,q,Date.now(),{materialConfig});return json({answer:result.answer,provider:'internal',model:'existing-video-index-preview',context:{route:'private_intelligence',receipts:result.receipts,video_index:result.video_index}});
 }catch{return json({error:'视频预览读取未完成；没有修改原知识或来源时间'},503)}
});
