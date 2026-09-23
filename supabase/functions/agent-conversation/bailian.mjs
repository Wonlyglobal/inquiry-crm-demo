// Beijing-only fixed endpoints. No caller-supplied URLs or provider fallback.
export const CHAT_URL='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
export const TTS_URL='https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
export const MODELS={chat:'qwen-plus',transcribe:'qwen3-asr-flash',speech:'qwen3-tts-flash'};
export async function boundedBytes(response,max=12*1024*1024){
 if(Number(response.headers.get('content-length')||0)>max)throw Error('服务响应过大');
 const reader=response.body?.getReader();if(!reader)throw Error('服务响应为空');let size=0;const parts=[];
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('服务响应过大')}parts.push(value)}
 const out=new Uint8Array(size);let n=0;for(const p of parts){out.set(p,n);n+=p.length}return out;
}
export async function providerJson(url,body,key,fetcher=fetch){
 if(![CHAT_URL,TTS_URL].includes(url))throw Error('模型地址不允许');
 const response=await fetcher(url,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(response.status===401?'百炼密钥无效或地域不匹配':response.status===429?'百炼额度或速率受限':response.status===403?'百炼模型权限或账户状态受限':'百炼服务暂不可用');
 return JSON.parse(new TextDecoder().decode(await boundedBytes(response,1024*1024)));
}
export function completionText(payload){const c=payload?.choices?.[0];if(c?.finish_reason!=='stop')throw Error('模型未完成回答，请重试');if(typeof c.message?.content!=='string'||!c.message.content.trim())throw Error('模型没有返回文字回答');return c.message.content.trim().slice(0,6000)}
export function speechBody(text,voice){if(typeof text!=='string'||!text.trim()||text.length>1800)throw Error('播报文字长度不支持');return {model:MODELS.speech,input:{text,voice,language_type:/[\u3400-\u9fff]/.test(text)?'Chinese':'English'}}}
export function audioUrl(value){
 const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||!/^dashscope-result-bj\.oss-cn-beijing\.aliyuncs\.com$/.test(u.hostname))throw Error('语音下载地址不允许');u.protocol='https:';return u.href;
}
export async function speechAudio(payload,fetcher=fetch){
 const url=audioUrl(payload?.output?.audio?.url);
 // Do not forward the API key to object storage, or follow redirects.
 const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('语音下载失败');
 const bytes=await boundedBytes(r);const magic=new TextDecoder().decode(bytes.slice(0,12));
 if(!magic.startsWith('RIFF')||magic.slice(8,12)!=='WAVE')throw Error('语音格式不支持');return bytes;
}
export function transcriptionBody(bytes,mime){
 if(!['audio/wav','audio/webm','audio/ogg'].includes(mime)||bytes.length<100||bytes.length>2500000)throw Error('录音格式或大小不支持');
 let binary='';for(let n=0;n<bytes.length;n+=8192)binary+=String.fromCharCode(...bytes.subarray(n,n+8192));
 return {model:MODELS.transcribe,messages:[{role:'user',content:[{type:'input_audio',input_audio:{data:`data:${mime};base64,${btoa(binary)}`}}]}],stream:false,asr_options:{enable_itn:true}};
}
