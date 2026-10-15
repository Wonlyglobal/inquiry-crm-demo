// Continuous turns over the existing authenticated voice pipeline. No provider, storage or network here.
export const PHONE_TIMING=Object.freeze({silenceMs:750,waitMs:30000,maxSpeechMs:45000,minVoiceMs:250});
export const phoneEnd=text=>/^(?:(?:grace|请|帮我)[，,\s]*)?(?:挂断(?:电话)?|结束通话|停止通话|结束对话|停止对话|退出语音|我先挂了|goodbye)(?:吧|了)?[。！!？?\s]*$/i.test(String(text||'').trim());
export function createPhoneSession({prepare,capture,transcribe,respond,cancel=()=>{},onState=()=>{},isAllowed=()=>true,now=()=>Date.now(),maxMs=20*60*1000,maxIdleMs=60000}){
 let active=false,muted=false,phase='ended',generation=0,turn=null,input=null,deadline=null,tick=null,started=0,lastSpeech=0,turns=0,latency=null,rejections=0;
 const snapshot=()=>({active,muted,phase,turns,elapsedMs:active?Math.max(0,now()-started):0,latency});
 function emit(next,detail=''){phase=next;onState({...snapshot(),detail})}
 function release(){input?.release?.();input=null;clearTimeout(deadline);clearInterval(tick)}
 function stop(detail='通话已结束'){
  if(!active)return;active=false;generation++;turn?.abort();turn=null;cancel();release();emit('ended',detail);
 }
 async function loop(g){
  while(active&&generation===g&&!muted){
   if(!isAllowed()){stop('账号或当前页面已不可用，通话已结束');return}
   turn=new AbortController();const current=turn,signal=current.signal;
   try{
    emit('listening');const blob=await capture({signal,input,timing:PHONE_TIMING});
    if(!active||generation!==g)return;if(signal.aborted)continue;
    if(!blob){if(now()-lastSpeech>=maxIdleMs){stop('一段时间没有说话，已结束通话；需要时可以重新拨通');return}continue}
    const endedAt=now();lastSpeech=endedAt;emit('transcribing');const heard=await transcribe(blob,signal);
    if(!active||generation!==g)return;if(signal.aborted)continue;
    if(heard?.ignored==='unavailable'){stop('声纹服务暂不可用，通话已结束；可以用文字提问');return}
    if(heard?.ignored||!heard?.text?.trim()){if(++rejections>=3){stop('连续三次未能确认有效语音，通话已结束；可以用文字提问');return}emit('listening',heard?.ignored?'这段声音未通过验证，请重新说':'没听清，请再说一次');continue}
    rejections=0;if(phoneEnd(heard.text)){stop();return}
    emit('responding');await respond(heard,signal);
    if(!active||generation!==g)return;if(signal.aborted)continue;
    turns++;latency={...latency,turnMs:Math.max(0,now()-endedAt)};lastSpeech=now();
   }catch(e){if(!active||generation!==g)return;if(current.signal.aborted)continue;stop(e?.name==='NotAllowedError'?'麦克风未授权，通话未开启':e?.message||'语音连接失败，通话已结束');return}
  }
 }
 async function start(){
  if(active)return;if(!isAllowed())throw Error('当前账号不可通话');
  active=true;muted=false;started=lastSpeech=now();turns=0;latency=null;rejections=0;const g=++generation;emit('connecting');
  deadline=setTimeout(()=>stop('本次通话已到20分钟，已自动挂断；可以重新拨通'),maxMs);tick=setInterval(()=>onState(snapshot()),1000);
  let prepared;
  try{turn=new AbortController();prepared=await prepare({signal:turn.signal});if(!active||generation!==g){prepared?.release?.();return}input=prepared;void loop(g)}catch(e){prepared?.release?.();if(active&&generation===g)stop(e?.name==='NotAllowedError'?'麦克风未授权，通话未开启':e?.message||'无法开启通话')}
 }
 function interrupt(){if(!active||muted||phase==='connecting')return;turn?.abort();cancel();emit('listening','我在听，请继续说');}
 function setMuted(value){if(!active||phase==='connecting'||muted===!!value)return;muted=!!value;generation++;turn?.abort();cancel();input?.stream?.getAudioTracks?.().forEach(t=>{t.enabled=!muted});emit(muted?'muted':'listening');if(!muted)void loop(generation)}
 return {start,stop,interrupt,setMuted,markSpeaking(firstAudioMs){if(active&&!muted){latency={requestToFirstAudioMs:firstAudioMs};emit('speaking')}},snapshot,isActive:()=>active};
}
