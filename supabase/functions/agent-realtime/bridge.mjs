import {LIMITS,sessionUpdate,nativeConversation,fromBase64,toBase64,pcmWav,confirmedSession,providerFrameMs} from './policy.mjs';
// All network, audit and identity operations are injected. Never forwards browser provider events.
export function createRealtimeBridge({send,openProvider,verify,authorizeTurn,proof,now=()=>Date.now(),history=[],previous='',initialTurn=0,pace=ms=>new Promise(r=>setTimeout(r,ms)),onError=()=>{}}){
 let current=null,lastTurn=initialTurn,closed=false;let publicHistory=history.slice(-8),previousQuestion=previous;
 const emit=(type,t,data={})=>{if(!closed)send({type,turn:t.id,...data})};
 function cancel(id){const t=current;if(!t||id!==t.id)return;t.cancelled=true;clearTimeout(t.timer);try{if(t.responding&&t.socket?.readyState===1)t.socket.send(JSON.stringify({type:'response.cancel'}))}catch{}t.socket?.close();t.pending=new Uint8Array(0);t.previous=new Uint8Array(0);t.readyReject?.(Error('已打断'));current=null}
 function fail(t,message){if(current!==t||closed)return;emit('error',t,{message});cancel(t.id);onError(message)}
 const valid=t=>!closed&&current===t&&!t.cancelled;
 function providerSend(t,event){if(!valid(t)||t.socket?.readyState!==1)throw Error('实时模型连接已中断');if(t.socket.bufferedAmount>256000)throw Error('实时模型发送积压');t.socket.send(JSON.stringify(event))}
 async function event(t,e){
  if(!valid(t))return;
  if(e.type==='session.updated'){
   const s=e.session;if(!confirmedSession(s))throw Error('实时模型未确认受控音频配置');t.configured=true;t.readyResolve();return;
  }
  if(e.type==='error')throw Error('实时模型请求失败，请稍后重试');
  if(e.type==='conversation.item.input_audio_transcription.failed')throw Error('实时语音识别失败，请重新说一次');
  if(e.type==='conversation.item.input_audio_transcription.completed'){
   if(!t.committed||t.transcribed)throw Error('转写时序无效');const text=String(e.transcript||'').trim();if(!text){emit('ignored',t,{ignored:'empty'});cancel(t.id);return}
   const native=nativeConversation(text,previousQuestion);t.transcribed=true;t.question=text;t.native=native;previousQuestion=text.slice(0,500);clearTimeout(t.timer);
   const voiceProof=await proof(t.speaker,text);if(!valid(t))return;emit('transcript',t,{text,native,voiceProof});
   if(!native){t.delegated=true;cancel(t.id);return}t.timer=setTimeout(()=>fail(t,'等待实时回答超时'),45000);return;
  }
  // Provider audio/text is dropped unless the entire utterance passed voiceprint and routing.
  if(!t.responding)return;
  if(e.type==='response.audio.delta'){
   const bytes=fromBase64(e.delta,128000);t.output+=bytes.length;if(t.output>LIMITS.maxOutputBytes)throw Error('实时回答语音过长');emit('audio',t,{audio:toBase64(bytes),sampleRate:24000});
  }else if(e.type==='response.audio_transcript.delta'){
   if(typeof e.delta!=='string'||t.answer.length+e.delta.length>3000)throw Error('实时回答文字过长');t.answer+=e.delta;
  }else if(e.type==='response.audio_transcript.done'){
   if(typeof e.transcript==='string'&&e.transcript.length<=3000)t.answer=e.transcript;
  }else if(e.type==='response.done'){
   if(e.response?.status!=='completed'||!t.output||!t.answer.trim())throw Error('实时模型没有完成回答');t.generated=true;t.responding=false;clearTimeout(t.timer);emit('done',t,{answer:t.answer});
  }
 }
 async function begin(id){
  if(closed||!Number.isSafeInteger(id)||id!==lastTurn+1)throw Error('通话轮次无效');if(current)throw Error('上一轮尚未结束');lastTurn=id;
  const t={id,at:now(),seq:0,total:0,pending:new Uint8Array(0),previous:new Uint8Array(0),committing:false,committed:false,draining:false,configured:false,speaker:null,answer:'',output:0,cancelled:false};current=t;
  t.ready=new Promise((resolve,reject)=>{t.readyResolve=resolve;t.readyReject=reject});t.ready.catch(()=>{});t.timer=setTimeout(()=>fail(t,'实时语音连接超时'),10000);
  try{
   await authorizeTurn();if(!valid(t))return;
   t.socket=openProvider();t.socket.onopen=()=>{try{providerSend(t,sessionUpdate(publicHistory))}catch(e){fail(t,e.message)}};
   t.socket.onmessage=e=>{if(typeof e.data!=='string'||e.data.length>200000){fail(t,'实时模型事件超限');return}let data;try{data=JSON.parse(e.data)}catch{fail(t,'实时模型事件无效');return}t.events=(t.events||Promise.resolve()).then(()=>event(t,data)).catch(e=>fail(t,e.message));};
   t.socket.onerror=()=>fail(t,'实时模型连接失败');t.socket.onclose=()=>{if(valid(t)&&!t.delegated&&!t.generated)fail(t,'实时模型连接已断开')};
   await t.ready;if(!valid(t))return;clearTimeout(t.timer);t.timer=setTimeout(()=>fail(t,'单次讲话时间过长'),60000);emit('turn.ready',t);
  }catch(e){fail(t,e.message)}
 }
 async function drain(t){
  if(t.draining||!valid(t))return;t.draining=true;
  try{
   await t.ready;
   while(valid(t)&&(t.pending.length>=LIMITS.blockBytes||t.committing&&t.pending.length)){
    const n=Math.min(t.pending.length,LIMITS.blockBytes),part=t.pending.slice(0,n);t.pending=t.pending.slice(n);
    const check=n<LIMITS.blockBytes&&t.previous.length?new Uint8Array(t.previous.length+part.length):part;
    if(check!==part){check.set(t.previous);check.set(part,t.previous.length)}
    const speaker=await verify(pcmWav(check));if(!valid(t))return;
    if(!['owner','not_enrolled'].includes(speaker)||t.speaker&&t.speaker!==speaker){emit('ignored',t,{ignored:speaker||'unavailable'});cancel(t.id);return}
    t.speaker=speaker;t.previous=part.slice(-LIMITS.blockBytes);for(let at=0;at<part.length;at+=6400){if(!valid(t))return;providerSend(t,{type:'input_audio_buffer.append',audio:toBase64(part.subarray(at,at+6400))});await pace(providerFrameMs(Math.min(6400,part.length-at)))}
   }
   if(valid(t)&&t.committing&&!t.pending.length&&!t.committed){if(t.total<2000||!t.speaker){emit('ignored',t,{ignored:'empty'});cancel(t.id);return}t.committed=true;providerSend(t,{type:'input_audio_buffer.commit'});clearTimeout(t.timer);t.timer=setTimeout(()=>fail(t,'实时语音识别超时'),15000)}
  }catch(e){fail(t,e.message)}finally{t.draining=false}
 }
 return {
  begin,
  append({turn,seq,audio}){const t=current;if(!t||t.id!==turn||t.committing||seq!==t.seq+1)throw Error('音频帧顺序无效');const bytes=fromBase64(audio,LIMITS.maxFrameBytes);t.seq=seq;t.total+=bytes.length;if(t.total>LIMITS.maxAudioBytes||t.total>32000*((now()-t.at)/1000+LIMITS.maxPendingBytes/32000))throw Error('输入语音超限');if(t.pending.length+bytes.length>LIMITS.maxPendingBytes)throw Error('声纹校验积压，请稍后重试');const next=new Uint8Array(t.pending.length+bytes.length);next.set(t.pending);next.set(bytes,t.pending.length);t.pending=next;void drain(t)},
  commit(id){const t=current;if(!t||t.id!==id||t.committing)throw Error('提交轮次无效');t.committing=true;void drain(t)},
  respond(id){const t=current;if(!t||t.id!==id||!t.native||!t.transcribed||t.responding||t.generated)throw Error('回答尚未通过校验');t.responding=true;providerSend(t,{type:'response.create'})},
  heard(id){const t=current;if(!t||t.id!==id||!t.generated)throw Error('回答尚未播完');publicHistory=[...publicHistory,{role:'user',content:t.question.slice(0,1000)},{role:'assistant',content:t.answer.slice(0,1000)}].slice(-8);cancel(id)},
  cancel,
  state(){return {lastTurn,history:publicHistory,previous:previousQuestion}},
  close(){if(current)cancel(current.id);closed=true;publicHistory=[];previousQuestion=''}
 };
}
