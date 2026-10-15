import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import WebSocketClient from 'npm:ws@8.21.3';
import {eligible,POLICY} from '../agent-conversation/policy.mjs';
import {voiceprintCall,speakerOf,voiceProof} from '../agent-conversation/voiceprint.mjs';
import {REALTIME_POLICY,REALTIME_MODEL,LIMITS,realtimeUrl,sessionUpdate,confirmedSession,diagnosticPcm,fromBase64,toBase64} from './policy.mjs';
import {createRealtimeBridge} from './bridge.mjs';
const ORIGIN='https://crm.foreverdoodle.com';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
const json=(d:unknown,status=200)=>new Response(JSON.stringify(d),{status,headers:{...cors,'Content-Type':'application/json'}});
const env=(group:string,legacy:string)=>{try{return JSON.parse(Deno.env.get(group)||'{}').default||Deno.env.get(legacy)||''}catch{return Deno.env.get(legacy)||''}};
const key=()=>Deno.env.get('DASHSCOPE_API_KEY')||'';
const configured=()=>!!key()&&/^[a-zA-Z0-9-]{4,80}$/.test(Deno.env.get('BAILIAN_REALTIME_WORKSPACE_ID')||'');
const enabled=()=>Deno.env.get('BAILIAN_AGENT_POLICY')===POLICY&&Deno.env.get('BAILIAN_REALTIME_POLICY')===REALTIME_POLICY&&Deno.env.get('VOICEPRINT_ENABLED')==='1';
const mac=async(text:string)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key()),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('')};
function same(a:string,b:string){let n=a.length^b.length;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return n===0}
function admin(){return createClient(Deno.env.get('SUPABASE_URL')||'',env('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}})}
async function authorize(token:string){
 if(typeof token!=='string'||token.length<20||token.length>8000)throw Error('请重新登录');
 const client=createClient(Deno.env.get('SUPABASE_URL')||'',env('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
 const {data:{user},error}=await client.auth.getUser();if(error||!user)throw Error('请重新登录');const {data:profile}=await client.from('profiles').select('active,role').eq('id',user.id).single();if(!eligible(user,profile))throw Error('当前账号未获通话授权');return user;
}
async function audit(userId:string,action:string,operation:string,limit:number,extra={}){
 const db=admin(),{count,error}=await db.from('audit_logs').select('id',{head:true,count:'exact'}).eq('actor_id',userId).eq('action',action).gte('created_at',new Date(Date.now()-60000).toISOString());if(error)throw Error('无法核验通话限额');if((count||0)>=limit)throw Error('通话请求较多，请一分钟后重试');
 const {error:write}=await db.from('audit_logs').insert({actor_id:userId,entity_type:'profile',entity_id:userId,action,after_data:{operation,provider:'bailian',model:REALTIME_MODEL,policy:REALTIME_POLICY,...extra},reason:'主动实时语音；不记录原始录音、转写正文、令牌或内部资料'});if(write)throw Error('通话审计未完成');
}
function upstream(){return new WebSocketClient(realtimeUrl(Deno.env.get('BAILIAN_REALTIME_WORKSPACE_ID')), {headers:{Authorization:'Bearer '+key()},maxPayload:200000,handshakeTimeout:8000,perMessageDeflate:false,followRedirects:false})}
async function probe(userId:string){
 await audit(userId,'agent_realtime_probe','synthetic_public_loopback',2);
 const vp=await voiceprintCall({actor:userId,privateJwk:Deno.env.get('MATERIAL_SIGNING_PRIVATE_JWK'),serviceUrl:Deno.env.get('MATERIAL_LIBRARY_URL'),secret:Deno.env.get('MATERIAL_LIBRARY_SECRET'),op:'status'});
 if(vp.status!=='ok')throw Error('公司声纹服务暂不可用，实时通话保持关闭');
 return await new Promise((resolve,reject)=>{
  const ws=upstream(),started=Date.now();let bytes=0,chunks=0,first:number|null=null,settled=false,phase='config',parts:Uint8Array[]=[],manualTimer:any;
  const timer=setTimeout(()=>finish(Error('实时模型检查超时')),20000);
  function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);clearTimeout(manualTimer);ws.close();parts=[];error?reject(error):resolve({ready:true,model:REALTIME_MODEL,audio_chunks:chunks,audio_bytes:bytes,first_audio_ms:first,elapsed_ms:Date.now()-started,synthetic:true,input_transcription_verified:true,manual_verified:true,voiceprint_available:true,voiceprint_registered:typeof vp.samples==='number'&&typeof vp.required==='number'&&vp.samples>=vp.required})}
  ws.onopen=()=>ws.send(JSON.stringify(sessionUpdate()));ws.onerror=()=>finish(Error('实时模型连接失败'));ws.onclose=()=>{if(!settled)finish(Error('实时模型连接已关闭'))};
  ws.onmessage=e=>{try{const d=JSON.parse(String(e.data));if(d.type==='error'){finish(Error('实时模型权限或配置尚未通过检查'));return}
   if(d.type==='session.updated'&&phase==='config'){
    if(!confirmedSession(d.session)){finish(Error('实时模型配置未确认'));return}phase='greeting';
    ws.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'只用中文说：你好，我是Grace。'}]}}));ws.send(JSON.stringify({type:'response.create'}));return;
   }
   if(phase==='loopback'&&(d.type==='response.created'||d.type==='response.audio.delta')){finish(Error('实时模型未保持受控回答模式'));return}
   if(phase==='greeting'&&d.type==='response.audio.delta'){const part=fromBase64(d.delta,128000);first??=Date.now()-started;chunks++;bytes+=part.length;parts.push(part);if(bytes>200000)finish(Error('诊断回复超限'))}
   if(phase==='greeting'&&d.type==='response.done'){
    if(!chunks||d.response?.status!=='completed'){finish(Error('实时模型未返回完整音频'));return}
    // No microphone/browser audio is accepted by this diagnostic. Only the fixed
    // public greeting produced above is returned to the same provider for ASR.
    const audio=diagnosticPcm(parts);parts=[];phase='loopback';
    for(let at=0;at<audio.length;at+=6400)ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:toBase64(audio.subarray(at,at+6400))}));ws.send(JSON.stringify({type:'input_audio_buffer.commit'}));return;
   }
   if(phase==='loopback'&&d.type==='conversation.item.input_audio_transcription.failed'){finish(Error('实时输入语音检查失败'));return}
   if(phase==='loopback'&&d.type==='conversation.item.input_audio_transcription.completed'){
    if(!String(d.transcript||'').trim()){finish(Error('实时输入语音没有转写'));return}if(!manualTimer)manualTimer=setTimeout(()=>finish(),1000);
   }
  }catch{finish(Error('实时模型事件无效'))}};
 });
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return json({error:'来源不允许'},403);
 const upgrade=req.headers.get('upgrade')?.toLowerCase()==='websocket';
 if(!upgrade){if(req.method!=='POST')return json({error:'仅支持受控通话'},405);try{
  const user=await authorize((req.headers.get('authorization')||'').replace(/^Bearer /,''));const body=await req.text();if(body.length>500)return json({error:'请求过大'},400);const d=JSON.parse(body);
  if(d.action==='status')return json({configured:configured(),enabled:enabled(),ready:configured()&&enabled(),model:REALTIME_MODEL});
  if(d.action==='probe'&&configured()&&Deno.env.get('BAILIAN_AGENT_POLICY')===POLICY)return json(await probe(user.id));return json({error:'实时语音尚未启用'},503);
 }catch(e){return json({error:e instanceof Error?e.message:'连接失败'},403)}}
 if(req.method!=='GET'||new URL(req.url).search)return json({error:'通话地址无效'},400);
 if(!configured()||!enabled())return json({error:'实时语音尚未启用'},503);
 const {socket,response}=Deno.upgradeWebSocket(req);let bridge:any=null,token='',user:any=null,callStarted=Date.now(),authenticated=false,authenticating=false,closed=false,started=Date.now(),lastTraffic=Date.now(),messageCount=0,messageAt=Date.now();
 const send=(d:unknown)=>{if(socket.readyState===1){if(socket.bufferedAmount>1000000){close('通话接收积压');return}socket.send(JSON.stringify(d))}};
 function close(message='通话已结束'){if(closed)return;closed=true;clearTimeout(authTimer);clearTimeout(hardTimer);clearInterval(idleTimer);bridge?.close();token='';if(socket.readyState===1){socket.send(JSON.stringify({type:'closed',message}));socket.close(1000,'closed')}}
 const authTimer=setTimeout(()=>close('登录验证超时'),5000),hardTimer=setTimeout(()=>close('本次实时连接已到时，请重新拨通'),LIMITS.connectionMs),idleTimer=setInterval(()=>{if(Date.now()-lastTraffic>65000)close('长时间没有说话，通话已结束')},10000);
 socket.onclose=()=>close();socket.onerror=()=>close('通话连接失败');
 socket.onmessage=async event=>{
  try{
   if(typeof event.data!=='string'||event.data.length>(authenticated?12000:40000))throw Error('通话事件超限');const d=JSON.parse(event.data);if(!d||typeof d.type!=='string')throw Error('通话事件无效');
   if(Date.now()-messageAt>=1000){messageAt=Date.now();messageCount=0}if(++messageCount>60)throw Error('通话发送过快');
   if(!authenticated){if(authenticating||d.type!=='auth'||Object.keys(d).some(k=>!['type','token','resume'].includes(k)))throw Error('登录验证未完成');authenticating=true;token=d.token;user=await authorize(token);await audit(user.id,'agent_realtime_session','connect',2);if(closed)return;
    let resume:any=null;if(d.resume){
     if(typeof d.resume.data!=='string'||d.resume.data.length>12000||typeof d.resume.signature!=='string'||!same(await mac(d.resume.data),d.resume.signature))throw Error('续接状态无效');resume=JSON.parse(d.resume.data);
     if(resume.user!==user.id||!Number.isFinite(resume.expires)||resume.expires<Date.now()||!Number.isFinite(resume.started)||resume.started>Date.now()||Date.now()-resume.started>LIMITS.callMs||!Number.isSafeInteger(resume.lastTurn)||resume.lastTurn<0||resume.lastTurn>5000||!Array.isArray(resume.history)||resume.history.length>8||resume.history.some((m:any)=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>1000)||typeof resume.previous!=='string'||resume.previous.length>500)throw Error('续接状态过期');callStarted=resume.started;
    }
    authenticated=true;clearTimeout(authTimer);started=Date.now();bridge=createRealtimeBridge({send,history:resume?.history||[],previous:resume?.previous||'',initialTurn:resume?.lastTurn||0,openProvider:upstream,authorizeTurn:async()=>{if(!enabled()||Date.now()-callStarted>LIMITS.callMs)throw Error('本次通话已结束');await authorize(token);await audit(user.id,'agent_bailian_request','realtime_turn',12)},verify:async audio=>{
     const result=await voiceprintCall({actor:user.id,privateJwk:Deno.env.get('MATERIAL_SIGNING_PRIVATE_JWK'),serviceUrl:Deno.env.get('MATERIAL_LIBRARY_URL'),secret:Deno.env.get('MATERIAL_LIBRARY_SECRET'),op:'verify',audio,mime:'audio/wav'});const speaker=speakerOf(result);
     const {error}=await admin().from('audit_logs').insert({actor_id:user.id,entity_type:'profile',entity_id:user.id,action:'agent_voiceprint',after_data:{op:'verify',speaker,transport:'realtime',dropped:!['owner','not_enrolled'].includes(speaker)},reason:'实时语音分段先核验说话人，未确认音频不送外部模型'});if(error)throw Error('声纹审计未完成');return speaker;
    },proof:(speaker,text)=>voiceProof({user:user.id,speaker,text},mac),onError:()=>close('实时语音中断，请重新拨通')});send({type:'ready',model:REALTIME_MODEL,lastTurn:resume?.lastTurn||0});return;
   }
   if(d.type==='ping'){send({type:'pong'});return}
   if(d.type==='turn.start'){if(Date.now()-started>LIMITS.rotateMs){const data=JSON.stringify({...bridge.state(),user:user.id,started:callStarted,expires:Date.now()+300000});send({type:'rotate',resume:{data,signature:await mac(data)}});close('实时连接需续接');return}lastTraffic=Date.now();void bridge.begin(d.turn).catch(()=>close('通话轮次无效'));return}
   if(d.type==='audio.append'){lastTraffic=Date.now();bridge.append(d);return}
   if(d.type==='audio.commit'){bridge.commit(d.turn);return}
   if(d.type==='response.start'){lastTraffic=Date.now();bridge.respond(d.turn);return}
   if(d.type==='response.heard'){lastTraffic=Date.now();bridge.heard(d.turn);return}
   if(d.type==='cancel'){bridge.cancel(d.turn);return}
   if(d.type==='close'){close();return}throw Error('通话操作不允许');
  }catch{close('通话校验失败，请重新拨通')}
 };
 return response;
});
