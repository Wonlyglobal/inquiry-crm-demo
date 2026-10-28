import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {withReadOnlyGuard} from '../_shared/read-only.ts';
import {providerJson,CHAT_URL,boundedBytes} from '../agent-conversation/bailian.mjs';
import {OUTREACH_COMPOSE_POLICY,composeRequest,composeBody,composeValidatedLetter} from '../../../assets/outreach-compose-policy.mjs';
const headers={'Access-Control-Allow-Origin':'https://crm.foreverdoodle.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
function env(group:string,key:string){try{return JSON.parse(Deno.env.get(group)||'{}').default||Deno.env.get(key)||''}catch{return Deno.env.get(key)||''}}
Deno.serve(withReadOnlyGuard(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({error:'不支持的方法'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')||'',authorization=req.headers.get('Authorization')||'';if(!authorization)return json({error:'需要登录'},401);
  const client=createClient(url,env('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)return json({error:'登录已失效'},401);
  const {data:profile}=await client.from('profiles').select('role,active').eq('id',user.id).single();if(!profile?.active||!['owner','sales'].includes(profile.role))return json({error:'无权生成开发信'},403);
  const raw=new TextDecoder().decode(await boundedBytes(req,18000));const input=composeRequest(JSON.parse(raw));
  const {data:inquiry,error:inquiryError}=await client.from('inquiries').select('id').eq('id',input.inquiry_id).single();if(inquiryError||!inquiry)return json({error:'无权访问该询盘'},403);
  if(Deno.env.get('OUTREACH_COMPOSE_POLICY')!==OUTREACH_COMPOSE_POLICY)return json({error:'公开依据最小生成策略尚未启用，未发送模型'},403);
  const key=Deno.env.get('DASHSCOPE_API_KEY')||'';if(!key)return json({error:'百炼生成未配置'},503);
  const admin=createClient(url,env('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const {count,error:limitError}=await admin.from('audit_logs').select('id',{count:'exact',head:true}).eq('actor_id',user.id).eq('action','outreach_public_evidence_compose').gte('created_at',new Date(Date.now()-60000).toISOString());if(limitError||count===null)return json({error:'无法核验生成额度'},503);if(count>=3)return json({error:'生成较频繁，请稍后再试'},429);
  const inputHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(composeBody(input).messages[1]))))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const {error:auditError}=await admin.from('audit_logs').insert({actor_id:user.id,entity_type:'inquiry',entity_id:inquiry.id,action:'outreach_public_evidence_compose',after_data:{policy:OUTREACH_COMPOSE_POLICY,input_hash:inputHash,company_count:input.company_facts.length,market_count:input.market_facts.length,product_count:input.product_facts.length,objective:input.objective,status:'requested'},reason:'用户逐项确认最小公开依据；不含联系人、原邮件、内部画册或背调全文，不自动发送'});if(auditError)return json({error:'生成审计失败'},503);
  const composed=await composeValidatedLetter(input,body=>providerJson(CHAT_URL,body,key));const letter=composed.letter;
  const outcome=await admin.from('audit_logs').insert({actor_id:user.id,entity_type:'inquiry',entity_id:inquiry.id,action:'outreach_public_evidence_generated',after_data:{input_hash:inputHash,status:'pending_human_review',provider_attempts:composed.attempts},reason:'已生成待人工审核正文；尚未保存或发送'});if(outcome.error)return json({error:'完成审计未确认，未返回草稿'},503);
  return json({...letter,draft_saved:false,provider:'bailian-beijing'});
 }catch(e){return json({error:e instanceof Error?e.message:'生成未完成'},400)}
}));
