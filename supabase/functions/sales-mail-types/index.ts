import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { withReadOnlyGuard } from '../_shared/read-only.ts';
import { POLICY,classificationProjection,validateClassification,CLASSIFICATION_PROMPT } from './classification.mjs';
const ORIGIN='https://crm.foreverdoodle.com';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{headers,status});
function key(){try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''}catch{return ''}}
Deno.serve(withReadOnlyGuard(async req=>{
 if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return json({error:'origin_not_allowed'},403);
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 try{
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,''),url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
 if(!token)return json({error:'unauthorized'},401);
 const db=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(token);if(authError||!user)return json({error:'session_invalid'},401);
 const body=await req.json(),sales=String(body.salesperson_id||''),month=String(body.period_start||'');
 if(!/^[a-f0-9-]{36}$/i.test(sales)||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month))return json({error:'invalid_request'},400);
 // Fixed policy, never a request-body bypass. No automatic/background classification.
 if(Deno.env.get('BAILIAN_MAIL_TYPES_POLICY')!==POLICY)return json({error:'classification_policy_not_enabled'},503);
 const apiKey=Deno.env.get('DASHSCOPE_API_KEY')||'',service=key();if(!apiKey||!service)return json({error:'service_unavailable'},503);
 const {data:workspace,error:scopeError}=await db.rpc('get_sales_mail_type_workspace',{target_sales:sales,target_month:month,target_pending:true});
 if(scopeError)return json({error:'scope_or_period_denied'},403);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error:limitError}=await admin.rpc('begin_sales_mail_type_batch',{target_actor:user.id,target_sales:sales});
 if(limitError)return json({error:'request_denied_or_rate_limited'},429);
 let processed=0,skipped=0,failed=0;
 for(const item of (workspace||[]).slice(0,2)){
 // Reuse caller JWT and RLS. Service role never reads arbitrary mail bodies.
 const {data:message,error:mailError}=await db.from('email_messages').select('id,direction,subject,body_text').eq('id',item.id).maybeSingle();
 if(mailError||!message){failed++;continue}
 const projection=classificationProjection(message);let method='skipped',category='uncertain',confidence:number|null=null,evidence='',reason='没有可安全外发的通用短语，待人工确认',model='none';
 if(projection.skip==='sensitive_content')reason='含高敏内容，未发送给外部模型，待人工确认';
 if(!projection.skip){
 try{
 const response=await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'qwen-plus',temperature:0,max_tokens:240,response_format:{type:'json_object'},messages:[{role:'system',content:CLASSIFICATION_PROMPT},{role:'user',content:JSON.stringify(projection.payload)}]}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('model_unavailable');
 const output=await response.json(),content=output?.choices?.[0]?.message?.content;
 const result=validateClassification(JSON.parse(String(content||'')),projection);if(!result)throw new Error('invalid_output');
 method='ai';category=result.category;confidence=result.confidence;evidence=result.evidence;model='qwen-plus';reason=category==='uncertain'?'证据不足或置信度不足，待人工确认':'依据通用正文短语生成的类型建议，尚未人工确认';
 }catch{method='failed';reason='模型不可用或输出未通过证据校验，待人工确认'}
 }
 const {error:saveError}=await admin.rpc('record_sales_mail_type',{target_message:item.id,target_hash:item.source_hash,target_category:category,target_method:method,target_confidence:confidence,target_reason:reason,target_evidence:evidence,target_model:model,target_actor:user.id});
 if(saveError){failed++;continue}if(method==='ai')processed++;else if(method==='failed')failed++;else skipped++;
 }
 return json({processed,skipped,failed,examined:Math.min(2,(workspace||[]).length),has_more:(workspace||[]).length>2,policy:POLICY});
 }catch{return json({error:'classification_failed'},400)}
}));
