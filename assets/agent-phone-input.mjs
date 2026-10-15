import {encodeWav} from './grace-recorder.mjs?v=20261006-1';
// One microphone/context per explicit call. Native PCM avoids invalid partial WebM headers.
export async function preparePhoneInput({mediaDevices=navigator.mediaDevices,Context=globalThis.AudioContext||globalThis.webkitAudioContext,signal,onEnded=()=>{}}={}){
 if(!mediaDevices?.getUserMedia||!Context)throw Error('当前浏览器不支持电话模式，请使用文字提问');
 const context=new Context();let stream,closed=false;
 const ended=()=>onEnded();
 const release=()=>{if(closed)return;closed=true;signal?.removeEventListener('abort',release);stream?.getTracks().forEach(t=>{t.removeEventListener?.('ended',ended);t.stop()});void context.close().catch(()=>{})};
 signal?.addEventListener('abort',release,{once:true});if(signal?.aborted){release();throw Error('通话已停止')}
 try{await context.resume();if(closed||signal?.aborted)throw Error('通话已停止');if(context.state!=='running')throw Error('请点击开始通话启用音频');stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(closed||signal?.aborted){stream.getTracks().forEach(t=>t.stop());throw Error('通话已停止')}stream.getAudioTracks().forEach(t=>t.addEventListener?.('ended',ended));return {stream,context,release}}catch(e){release();throw e}
}
// Local 250-ms PCM pre-roll preserves word onsets. Silence and playback audio are never uploaded.
export function capturePhoneTurn({signal,input,timing,onState=()=>{},now=()=>Date.now(),encode=encodeWav}){
 return new Promise((resolve,reject)=>{
  const {stream,context}=input;let source,processor,gain,deadline,done=false,heard=false,lastVoice=0,voicedMs=0,count=0,ringCount=0;let chunks=[],ring=[];
  const rate=context.sampleRate,preRoll=Math.ceil(rate*.25);
  function finish(error){if(done)return;done=true;clearTimeout(deadline);signal.removeEventListener('abort',abort);if(processor){processor.onaudioprocess=null;processor.disconnect()}source?.disconnect();gain?.disconnect();
   if(error){chunks=[];ring=[];reject(error);return}if(!heard||voicedMs<timing.minVoiceMs){chunks=[];ring=[];resolve(null);return}
   const samples=new Float32Array(count);let offset=0;for(const c of chunks){samples.set(c,offset);offset+=c.length}chunks=[];ring=[];try{resolve(encode(samples,rate))}catch(e){reject(e)}
  }
  const abort=()=>finish(Error('通话已停止'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return}
  try{
   if(!Number.isFinite(rate)||rate<8000||rate>192000||context.state!=='running'||!context.createScriptProcessor)throw Error('当前浏览器无法开启通话录音，请使用文字提问');
   source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(1024,1,1);gain=context.createGain();gain.gain.value=0;
   processor.onaudioprocess=e=>{if(done)return;const frame=e.inputBuffer.getChannelData(0).slice();let sum=0;for(const x of frame)sum+=x*x;const loud=Math.sqrt(sum/frame.length)>.018,t=now();
    if(!heard){ring.push(frame);ringCount+=frame.length;while(ringCount>preRoll&&ring.length>1)ringCount-=ring.shift().length;if(loud){heard=true;chunks=ring;count=ringCount;ring=[];ringCount=0;clearTimeout(deadline);deadline=setTimeout(()=>finish(),timing.maxSpeechMs);onState('正在听你说 · 说完后自动回答','listening')}}else{chunks.push(frame);count+=frame.length}
    if(loud){voicedMs+=frame.length/rate*1000;lastVoice=t}
    if(heard&&(count>=rate*(timing.maxSpeechMs/1000+.3)||t-lastVoice>=timing.silenceMs))finish();
   };
   source.connect(processor);processor.connect(gain);gain.connect(context.destination);deadline=setTimeout(()=>finish(),timing.waitMs);onState('通话中 · 我在听，说完会自动回答','listening');
  }catch(e){finish(e)}
 });
}
