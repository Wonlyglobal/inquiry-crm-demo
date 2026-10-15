// Concurrent local listening / playback, serial authenticated ASR and answers.
export const PHONE_TIMING=Object.freeze({silenceMs:600,waitMs:30000,maxSpeechMs:45000,minVoiceMs:250});
export const phoneEnd=text=>/^(?:(?:grace|请|帮我)[，,\s]*)?(?:挂断(?:电话)?|结束通话|停止通话|结束对话|停止对话|退出语音|我先挂了|goodbye)(?:吧|了)?[。！!？?\s]*$/i.test(String(text||'').trim());
function abortable(task,signal){
 return new Promise((resolve,reject)=>{const abort=()=>reject(Error('通话已停止'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});Promise.resolve(task).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))});
}
export function createPhoneSession({prepare,capture,transcribe,respond,cancel=()=>{},onState=()=>{},isAllowed=()=>true,now=()=>Date.now(),maxMs=20*60*1000,maxIdleMs=60000}){
 let active=false,muted=false,phase='ended',generation=0,turn=null,call=null,input=null,pending=null,deadline=null,tick=null,started=0,lastSpeech=0,turns=0,latency=null,rejections=0,interruptions=0,clipReadyAt=0;
 const snapshot=()=>({active,muted,phase,turns,interruptions,elapsedMs:active?Math.max(0,now()-started):0,latency});
 function emit(next,detail=''){phase=next;onState({...snapshot(),detail})}
 function clearCapture(){pending?.control.abort();pending=null}
 function release(){clearCapture();input?.release?.();input=null;clearTimeout(deadline);clearInterval(tick)}
 function stop(detail='通话已结束'){
  if(!active)return;active=false;generation++;turn?.abort();call?.abort();turn=call=null;cancel();release();emit('ended',detail);
 }
 function beginCapture(g,monitor=false,response=null){
  const control=new AbortController();const item={control,task:null};pending=item;
  // Capture may finish before the old answer; keep its outcome handled and reuse its PCM.
  item.task=Promise.resolve().then(()=>capture({signal:control.signal,input,timing:PHONE_TIMING,monitor,onSpeechStart:()=>{
   if(!active||muted||generation!==g||pending!==item)return;lastSpeech=now();
   if(response&&turn===response&&!response.signal.aborted){interruptions++;response.abort();cancel();emit('listening','听到你插话了，请继续说')}
  }})).then(blob=>({blob}),error=>{if(monitor&&active&&generation===g&&pending===item)stop(error?.message||'本机监听中断，通话已结束');return {error}});return item;
 }
 async function loop(g){
  while(active&&generation===g&&!muted){
   if(!isAllowed()){stop('账号或当前页面已不可用，通话已结束');return}
   turn=new AbortController();const current=turn,signal=current.signal;
   try{
    emit('listening');const item=pending||beginCapture(g),outcome=await item.task;if(pending===item)pending=null;
    if(!active||generation!==g)return;if(signal.aborted)continue;if(outcome.error)throw outcome.error;const blob=outcome.blob;
    if(!blob){if(now()-lastSpeech>=maxIdleMs){stop('一段时间没有说话，已结束通话；需要时可以重新拨通');return}continue}
    const endedAt=now();clipReadyAt=endedAt;lastSpeech=endedAt;emit('transcribing');beginCapture(g,true,current);const heard=await abortable(transcribe(blob,signal),signal);
    if(!active||generation!==g)return;if(signal.aborted)continue;
    if(heard?.ignored==='unavailable'){stop('声纹服务暂不可用，通话已结束；可以用文字提问');return}
    if(heard?.ignored||!heard?.text?.trim()){if(++rejections>=3){stop('连续三次未能确认有效语音，通话已结束；可以用文字提问');return}emit('listening',heard?.ignored?'这段声音未通过验证，请重新说':'没听清，请再说一次');continue}
    rejections=0;if(phoneEnd(heard.text)){stop();return}
    emit('responding');
    await abortable(respond(heard,signal),signal);
    if(!active||generation!==g)return;if(signal.aborted)continue;
    turns++;latency={...latency,turnMs:Math.max(0,now()-endedAt)};lastSpeech=now();
   }catch(e){if(!active||generation!==g)return;if(current.signal.aborted)continue;stop(e?.name==='NotAllowedError'?'麦克风未授权，通话未开启':e?.message||'语音连接失败，通话已结束');return}
  }
 }
 async function start(){
  if(active)return;if(!isAllowed())throw Error('当前账号不可通话');
  active=true;muted=false;started=lastSpeech=now();turns=interruptions=0;latency=null;rejections=0;const g=++generation;emit('connecting');
  deadline=setTimeout(()=>stop('本次通话已到20分钟，已自动挂断；可以重新拨通'),maxMs);tick=setInterval(()=>{if(!isAllowed()){stop('账号或当前页面已不可用，通话已结束');return}if(phase==='listening'&&now()-lastSpeech>=maxIdleMs){stop('一段时间没有说话，已结束通话；需要时可以重新拨通');return}onState(snapshot())},1000);
  let prepared;
  try{call=new AbortController();prepared=await prepare({signal:call.signal});if(!active||generation!==g){prepared?.release?.();return}input=prepared;void loop(g)}catch(e){prepared?.release?.();if(active&&generation===g)stop(e?.name==='NotAllowedError'?'麦克风未授权，通话未开启':e?.message||'无法开启通话')}
 }
 function interrupt(){if(!active||muted||phase==='connecting')return;clearCapture();turn?.abort();cancel();emit('listening','我在听，请继续说')}
 function setMuted(value){if(!active||phase==='connecting'||muted===!!value)return;muted=!!value;generation++;clearCapture();turn?.abort();cancel();input?.stream?.getAudioTracks?.().forEach(t=>{t.enabled=!muted});lastSpeech=now();emit(muted?'muted':'listening');if(!muted)void loop(generation)}
 return {start,stop,interrupt,setMuted,attachPlayback(audio){return active&&!muted?input?.attachPlayback?.(audio):null},markSpeaking(firstAudioMs){if(active&&!muted){latency={requestToFirstAudioMs:firstAudioMs,clipReadyToFirstAudioMs:Math.max(0,now()-clipReadyAt)};emit('speaking')}},snapshot,isActive:()=>active};
}
