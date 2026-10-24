import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {withReadOnlyGuard} from '../_shared/read-only.ts';
import {providerJson,CHAT_URL} from '../agent-conversation/bailian.mjs';
import {TRANSLATION_POLICY,translationRequest,approvedCustomerCopy,translationBody,checkedTranslation} from './policy.mjs';
const headers={'Access-Control-Allow-Origin':'https://crm.foreverdoodle.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
function env(group:string,key:string){try{return JSON.parse(Deno.env.get(group)||'{}').default||Deno.env.get(key)||''}catch{return Deno.env.get(key)||''}}
Deno.serve(withReadOnlyGuard(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({error:'不支持的方法'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')||'',authorization=req.headers.get('Authorization')||'';
  if(!authorization)return json({error:'需要登录'},401);
  const client=createClient(url,env('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)return json({error:'登录已失效'},401);
  const raw=await req.text();if(raw.length>2048)return json({error:'请求过长'},413);
  const input=translationRequest(JSON.parse(raw));
  const {data:snapshot,error:sourceError}=await client.from('outreach_final_copies').select('id,inquiry_id,draft_id,subject,body,source_language,source_hash,finalized_by').eq('id',input.final_copy_id).eq('finalized_by',user.id).single();
  if(sourceError||!snapshot)return json({error:'无权读取该定稿'},403);
  const {data:original,error:originalError}=await client.from('outreach_drafts').select('recipient_email,tone,objective').eq('id',snapshot.draft_id).eq('created_by',user.id).single();
  if(originalError||!original)return json({error:'原稿不可访问'},403);
  if(input.target_language===snapshot.source_language)return json({error:'目标语言与定稿相同，无需翻译'},400);
  const {data:profile}=await client.from('profiles').select('role,active').eq('id',user.id).single();if(!profile?.active||!['owner','sales'].includes(profile.role))return json({error:'无权生成译稿'},403);
  if(Deno.env.get('OUTREACH_TRANSLATION_POLICY')!==TRANSLATION_POLICY)return json({error:'定稿翻译的最小外发策略尚未启用，未向模型发送内容'},403);
  const copy=approvedCustomerCopy(snapshot),key=Deno.env.get('DASHSCOPE_API_KEY')||'';if(!key)return json({error:'百炼翻译未配置'},503);
  const requestKey=snapshot.id+':'+input.target_language;
  const existing=await client.from('outreach_drafts').select('*').eq('created_by',user.id).eq('translation_request_key',requestKey).maybeSingle();if(existing.error)throw Error('译稿版本检查失败');if(existing.data)return json({draft:existing.data,readback_verified:true,reused:true,pending_human_review:true,send_allowed:false});
  const admin=createClient(url,env('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const {count,error:limitError}=await admin.from('audit_logs').select('id',{count:'exact',head:true}).eq('actor_id',user.id).eq('action','outreach_final_copy_translate').gte('created_at',new Date(Date.now()-60000).toISOString());if(limitError||count===null)return json({error:'暂不能核验翻译额度'},503);if(count>=6)return json({error:'翻译较频繁，请一分钟后重试'},429);
  const {error:auditError}=await admin.from('audit_logs').insert({actor_id:user.id,entity_type:'inquiry',entity_id:snapshot.inquiry_id,action:'outreach_final_copy_translate',after_data:{final_copy_id:snapshot.id,source_hash:snapshot.source_hash,target_language:input.target_language,policy:TRANSLATION_POLICY,provider:'bailian-beijing',status:'requested'},reason:'用户确认定稿后的最小正文翻译；不含原线程/背调/附件/内部画册，不自动发送'});if(auditError)return json({error:'翻译审计失败'},503);
  const translated=checkedTranslation(await providerJson(CHAT_URL,translationBody(copy,input.target_language),key),copy);
  const {data:draft,error:saveError}=await client.from('outreach_drafts').insert({inquiry_id:snapshot.inquiry_id,created_by:user.id,recipient_email:original.recipient_email,subject_a:translated.subject,subject_b:translated.subject,selected_subject:translated.subject,body:translated.body,language:input.target_language,status:'draft',tone:original.tone,objective:original.objective,source_final_copy_id:snapshot.id,translation_request_key:requestKey}).select().single();
  if(saveError||!draft)return json({error:'译稿保存未确认，请刷新历史版本，勿反复生成'},503);
  const readback=await client.from('outreach_drafts').select('*').eq('id',draft.id).single();if(readback.error||readback.data?.body!==translated.body||readback.data?.source_final_copy_id!==snapshot.id)return json({error:'译稿可能已保存，但回读未确认，请刷新历史版本'},503);
  const outcome=await admin.from('audit_logs').insert({actor_id:user.id,entity_type:'inquiry',entity_id:snapshot.inquiry_id,action:'outreach_final_copy_translation_saved',after_data:{final_copy_id:snapshot.id,draft_id:draft.id,target_language:input.target_language,status:'pending_human_review'},reason:'译稿已保存回读，未发送'});
  if(outcome.error)return json({error:'译稿已保存，但完成审计未确认，请刷新历史版本'},503);
  return json({draft:readback.data,readback_verified:true,pending_human_review:true,send_allowed:false});
 }catch(e){return json({error:e instanceof Error?e.message:'翻译未完成'},400)}
}));
