import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {POLICY,PERSONAS,eligible,requestBody,outputText} from './policy.mjs';
import publicFeed from './public-knowledge.json' with {type:'json'};
const cors={'Access-Control-Allow-Origin':'https://crm.foreverdoodle.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const envKey=(group:string,legacy:string)=>{try{return JSON.parse(Deno.env.get(group)||'{}').default||Deno.env.get(legacy)||''}catch{return Deno.env.get(legacy)||''}};
const encoder=new TextEncoder();
async function mac(text:string,secret:string){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function ticket(data:unknown,key:string){const text=JSON.stringify(data);return {data:text,signature:await mac(text,key)}}
async function readLimited(req:Request,max:number){const reader=req.body?.getReader();if(!reader)throw Error('请求为空');let size=0;const parts=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('请求过大')}parts.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length}return bytes}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'仅支持POST'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!=='https://crm.foreverdoodle.com')return json({error:'来源不允许'},403);
 try{
  const url=Deno.env.get('SUPABASE_URL')||'',authorization=req.headers.get('authorization')||'';
  const client=createClient(url,envKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)return json({error:'请重新登录'},401);
  const {data:profile}=await client.from('profiles').select('active,role').eq('id',user.id).single();
  if(!eligible(user,profile))return json({error:'当前账号未获智能体对话授权'},403);
  const bytes=await readLimited(req,3*1024*1024),type=req.headers.get('content-type')||'';
  let input:any,form:FormData|null=null;
  if(type.startsWith('multipart/form-data')){form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();input={action:'transcribe',persona:form.get('persona')}}
  else input=JSON.parse(new TextDecoder().decode(bytes));
  const key=Deno.env.get('OPENAI_API_KEY')||'',enabled=Deno.env.get('OPENAI_AGENT_POLICY')===POLICY;
  if(input.action==='status')return json({configured:!!key,enabled,policy:POLICY,model:Deno.env.get('OPENAI_AGENT_MODEL')||'gpt-5.4-mini'});
  if(!enabled)return json({error:'OpenAI数据范围尚未批准启用',code:'POLICY_PENDING'},503);
  if(!key)return json({error:'OpenAI服务密钥尚未配置',code:'KEY_MISSING'},503);
  if(!PERSONAS[input.persona])return json({error:'智能体无效'},400);
  if(!['chat','transcribe','speech','greeting'].includes(input.action))return json({error:'操作无效'},400);
  const admin=createClient(url,envKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
  const action='agent_openai_request';
  const {count,error:rateError}=await admin.from('audit_logs').select('id',{count:'exact',head:true}).eq('actor_id',user.id).eq('action',action).gte('created_at',new Date(Date.now()-60000).toISOString());
  if(rateError)return json({error:'暂时无法核验调用限额'},503);
  if((count||0)>=12)return json({error:'请求较多，请一分钟后重试'},429);
  const model=input.action==='chat'?(Deno.env.get('OPENAI_AGENT_MODEL')||'gpt-5.4-mini'):input.action==='transcribe'?'gpt-4o-mini-transcribe':'gpt-4o-mini-tts';
  let endpoint='',body:BodyInit,headers:Record<string,string>={Authorization:`Bearer ${key}`};
  if(input.action==='chat'){
   endpoint='responses';body=JSON.stringify(requestBody(input,model,JSON.stringify(publicFeed)));headers['Content-Type']='application/json';
  }else if(input.action==='transcribe'){
   const audio=form?.get('audio');if(!(audio instanceof File)||audio.size<100||audio.size>2500000||!['audio/webm','audio/mp4','audio/ogg','audio/wav'].includes(audio.type.split(';')[0]))return json({error:'录音格式或大小不支持'},400);
   const payload=new FormData();payload.append('file',audio,'speech.'+({'audio/mp4':'mp4','audio/webm':'webm','audio/ogg':'ogg','audio/wav':'wav'}[audio.type.split(';')[0]]));payload.append('model',model);payload.append('language','zh');endpoint='audio/transcriptions';body=payload;
  }else if(input.action==='greeting'){
   endpoint='audio/speech';body=JSON.stringify({model,voice:PERSONAS[input.persona].voice,input:'Hello Chloe',response_format:'mp3'});headers['Content-Type']='application/json';
  }else{
   const t=input.ticket;if(typeof t?.data!=='string'||t.data.length>40000||typeof t.signature!=='string')return json({error:'播报凭据无效'},400);
   const expected=await mac(t.data,key);let mismatch=expected.length^t.signature.length;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^(t.signature.charCodeAt(i)||0);
   if(mismatch)return json({error:'播报凭据无效'},403);
   const data=JSON.parse(t.data);if(data.user!==user.id||data.persona!==input.persona||data.expires<Date.now())return json({error:'播报已过期，请重新提问'},403);
   endpoint='audio/speech';body=JSON.stringify({model,voice:PERSONAS[input.persona].voice,input:data.text,response_format:'mp3',instructions:'用自然、清晰、亲切的中文播报，语速适中。'});headers['Content-Type']='application/json';
  }
  const requestId=crypto.randomUUID();
  const {error:auditError}=await admin.from('audit_logs').insert({actor_id:user.id,entity_type:'profile',entity_id:user.id,action,after_data:{request_id:requestId,provider:'openai',model,operation:input.action,persona:input.persona,policy:POLICY,input_bytes:bytes.length},reason:'已批准范围内的主动对话；不读取CRM客户数据'});
  if(auditError)return json({error:'调用审计失败，尚未发送至模型'},503);
  const response=await fetch('https://api.openai.com/v1/'+endpoint,{method:'POST',headers,body,signal:AbortSignal.timeout(60000)});
  if(!response.ok)return json({error:response.status===429?'OpenAI额度或速率受限，请检查账户':'OpenAI服务暂不可用，请稍后重试',code:'PROVIDER_ERROR'},502);
  if(['speech','greeting'].includes(input.action))return new Response(response.body,{headers:{...cors,'Content-Type':'audio/mpeg'}});
  const payload=await response.json();
  if(input.action==='transcribe')return json({text:String(payload.text||'').slice(0,3000)});
  const answer=outputText(payload),speech=answer.replace(/https?:\/\/\S+/g,'来源链接见文字回答').slice(0,1800);
  return json({answer,model,provider:'openai',ticket:await ticket({user:user.id,persona:input.persona,text:speech,expires:Date.now()+300000},key)});
 }catch(error){return json({error:error instanceof Error&&/请求|问题|历史|智能体|敏感|移除|未完成|文字回答/.test(error.message)?error.message:'请求未完成，请稍后重试'},400)}
});
