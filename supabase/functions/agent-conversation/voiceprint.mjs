// Speaker recognition ("is this Chloe?") backed by the internal material server.
// Approved by the owner 2026-09-28: the voiceprint template (a 192-number embedding, never audio)
// is stored only on the internal material server; audio passes through this function for one
// request and is not stored here. Enrollment and deletion are explicit owner actions.
// The result only changes how the agent talks and whether internal data is shown to the speaker;
// login remains the security boundary (a typed question is always treated as the account owner).
import {signMaterialRequest} from './material-request-proof.mjs';
import {boundedBytes} from './bailian.mjs';
export const VOICEPRINT_PATH='/api/integrations/crm/voiceprint';
export const SPEAKERS=['owner','other','uncertain','not_enrolled','unavailable'];
const OPS=['enroll','verify','status','delete'];

export function voiceprintUrl(serviceUrl){
 try{const url=new URL(serviceUrl);if(url.protocol!=='https:'||url.hostname!=='file.foreverdoodle.com'||url.username||url.password)return null;url.pathname=VOICEPRINT_PATH;url.search='';url.hash='';return url.href}catch{return null}
}
function base64(bytes){let s='';for(let n=0;n<bytes.length;n+=8192)s+=String.fromCharCode(...bytes.subarray(n,n+8192));return btoa(s)}

export async function voiceprintCall({op,audio=null,mime=null,actor,privateJwk,serviceUrl,secret},fetcher=fetch){
 if(!OPS.includes(op))return {status:'invalid'};
 const url=voiceprintUrl(serviceUrl);if(!url||!secret||!privateJwk||!actor)return {status:'not_configured'};
 if(['enroll','verify'].includes(op)&&(!(audio instanceof Uint8Array)||audio.length<2000||audio.length>2500000||!['audio/webm','audio/ogg','audio/wav'].includes(mime)))return {status:'invalid_audio'};
 try{
  const body=JSON.stringify({op,...audio?{mime,audio:base64(audio)}:{}});
  const proof=await signMaterialRequest({body,actor,privateJwk,path:VOICEPRINT_PATH});
  const r=await fetcher(url,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'X-CRM-Proof':proof,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(op==='verify'?6000:15000)});
  const data=JSON.parse(new TextDecoder().decode(await boundedBytes(r,64*1024)));
  if(!r.ok)return {status:'unavailable',code:String(data?.error||'http_'+r.status).slice(0,40)};
  return sanitize(data);
 }catch(error){console.error('voiceprint_failure',op,error instanceof Error?error.name:'unknown');return {status:'unavailable',code:'connection_failed'}}
}
// Only whitelisted, non-biometric fields leave this module (never the embedding).
export function sanitize(d){
 const n=x=>typeof x==='number'&&Number.isFinite(x)?Math.round(x*1000)/1000:null;
 return {status:d?.status==='ok'?'ok':'unavailable',speaker:SPEAKERS.includes(d?.speaker)?d.speaker:undefined,score:n(d?.score),samples:Number.isInteger(d?.samples)?d.samples:undefined,required:Number.isInteger(d?.required)?d.required:undefined,seconds:n(d?.seconds),deleted:Number.isInteger(d?.deleted)?d.deleted:undefined,code:typeof d?.code==='string'?d.code.slice(0,40):undefined};
}
export function speakerOf(result){return result?.status==='ok'&&SPEAKERS.includes(result.speaker)?result.speaker:'unavailable'}

// Signed, short-lived proof that ties the speaker result to exactly this transcript.
const hashText=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(t).trim())))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function voiceProof({user,speaker,text,now=Date.now()},sign){const data=JSON.stringify({kind:'voice',user,speaker,text:await hashText(text),exp:now+300000});return {data,signature:await sign(data)}}
export async function readVoiceProof(proof,{user,question,now=Date.now()},sign){
 try{
  if(!proof)return null;if(typeof proof.data!=='string'||proof.data.length>600||typeof proof.signature!=='string')return null;
  const expected=await sign(proof.data);let diff=expected.length^proof.signature.length;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^(proof.signature.charCodeAt(i)||0);if(diff)return null;
  const d=JSON.parse(proof.data);if(d.kind!=='voice'||d.user!==user||d.exp<now||!SPEAKERS.includes(d.speaker)||d.text!==await hashText(question))return null;
  return d.speaker;
 }catch{return null}
}

export const guestInstruction='当前语音的说话人经声纹比对不是已注册的 Chloe。你只能回答公开、通用的问题；不要提及或推测任何CRM、客户、背调、SEO、社媒、物料或产品内部资料。如果对方问到内部信息，礼貌说明需要 Chloe 本人确认后才能查看。语气友好，不指责对方。';
export function enrollmentReply(result){
 if(result.status==='not_configured')return '声纹服务还没有接通，需要先在物料服务器上线声纹模块。';
 if(result.status==='invalid_audio')return '这段录音太短或格式不支持，请用正常语速说 5 到 10 秒再试。';
 if(result.status!=='ok')return result.code==='too_short'?'这段录音里有效说话时间太短，请连续说 5 到 10 秒再试。':'声纹服务暂时不可用，请稍后再试。';
 if(result.deleted!==undefined)return `已删除你的声纹（${result.deleted} 段样本特征），之后我不再按声音识别说话人。`;
 if(result.samples!==undefined&&result.required!==undefined)return result.samples>=result.required?`声纹已注册完成（${result.samples} 段）。之后语音提问时我会确认是不是你；别人说话时我只回答公开问题。`:`已记录第 ${result.samples} 段，还需要 ${result.required-result.samples} 段。换一句话再录一次即可。`;
 return '声纹操作已完成。';
}
