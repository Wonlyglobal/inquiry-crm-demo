import {encodeWav} from './grace-recorder.mjs?v=20261006-1';
import {createEchoReference} from './agent-phone-echo.mjs?v=20261015-duplex1';
// One microphone/context per explicit call. Raw PCM exists only in bounded local RAM.
export async function preparePhoneInput({mediaDevices=navigator.mediaDevices,Context=globalThis.AudioContext||globalThis.webkitAudioContext,signal,onEnded=()=>{},now=()=>Date.now()}={}){
 if(!mediaDevices?.getUserMedia||!Context)throw Error('当前浏览器不支持电话模式，请使用文字提问');
 const context=new Context({latencyHint:'interactive'});let stream,closed=false,input;
 const ended=()=>onEnded();
 const release=()=>{if(closed)return;closed=true;signal?.removeEventListener('abort',release);input?.playback?.release();input?.echo.clear();stream?.getTracks().forEach(t=>{t.removeEventListener?.('ended',ended);t.stop()});void context.close().catch(()=>{})};
 signal?.addEventListener('abort',release,{once:true});if(signal?.aborted){release();throw Error('通话已停止')}
 try{
  await context.resume();if(closed||signal?.aborted)throw Error('通话已停止');if(context.state!=='running')throw Error('请点击开始通话启用音频');
  stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
  if(closed||signal?.aborted){stream.getTracks().forEach(t=>t.stop());throw Error('通话已停止')}stream.getAudioTracks().forEach(t=>t.addEventListener?.('ended',ended));
  input={stream,context,release,echo:createEchoReference(context.sampleRate),echoUntil:0,playback:null,attachPcmPlayback(bus){
   if(closed)throw Error('通话已结束');input.playback?.release();input.echo.clear();const output=context.createGain(),reference=context.createScriptProcessor(1024,1,1),sink=context.createGain();output.gain.value=1;sink.gain.value=0;bus.connect(output);output.connect(context.destination);bus.connect(reference);reference.connect(sink);sink.connect(context.destination);let stopped=false;
   const playback={get active(){return !stopped},supported:true,duck(){output.gain.value=0},restore(){if(!stopped)output.gain.value=1},release(){if(stopped)return;stopped=true;reference.onaudioprocess=null;bus.disconnect();reference.disconnect();output.disconnect();sink.disconnect();if(input.playback===playback){input.playback=null;input.echoUntil=now()+180}}};reference.onaudioprocess=e=>input.echo.push(e.inputBuffer.getChannelData(0));input.playback=playback;return playback;
  },attachPlayback(audio){
   if(closed)return null;input.playback?.release();input.echo.clear();let source,reference,output,sink,released=false,supported=false;
   const playback={get active(){return !released&&!audio.paused&&!audio.ended},get supported(){return supported},duck(){if(output)output.gain.value=0},restore(){if(output&&!released)output.gain.value=1},release(){
    if(released)return;released=true;if(reference){reference.onaudioprocess=null;reference.disconnect()}source?.disconnect();output?.disconnect();sink?.disconnect();if(input.playback===playback){input.playback=null;input.echoUntil=now()+180}
   }};
   input.playback=playback;
   try{
    // Keep reference before the output gain so a short duck never feeds back into detection.
    output=context.createGain();output.gain.value=1;sink=context.createGain();sink.gain.value=0;reference=context.createScriptProcessor(1024,1,1);
    source=context.createMediaElementSource(audio);source.connect(output);output.connect(context.destination);source.connect(reference);reference.connect(sink);sink.connect(context.destination);
    reference.onaudioprocess=e=>input.echo.push(e.inputBuffer.getChannelData(0));supported=true;
   }catch{
    // If routing exists but reference setup failed, keep audio audible and disable only auto barge-in.
    reference?.disconnect();source?.disconnect();if(source)source.connect(context.destination);
   }
   return playback;
  }};return input;
 }catch(e){release();throw e}
}
// Half-second local pre-roll retains the word onset through echo confirmation. The optional realtime sink receives only locally accepted utterances; server voiceprint
// verification still precedes every cloud upload. During playback, correlated echo and unconfirmed probes are not utterances.
export function capturePhoneTurn({signal,input,timing,onState=()=>{},onSpeechStart=()=>{},monitor=false,onPcm=null,onAudioEnd=()=>{},onCaptureAbort=()=>{},now=()=>Date.now(),encode=encodeWav}){
 return new Promise((resolve,reject)=>{
  const {stream,context}=input;let source,processor,gain,deadline,done=false,heard=false,lastVoice=0,voicedMs=0,count=0,ringCount=0,attackMs=0,probe=null,cooldown=0,streaming=true,calibrationMs=0,ambient=Infinity,ambientPeak=0;let chunks=[],ring=[],ambientWindow=[];let ambientMs=0;
  const rate=context.sampleRate,preRoll=Math.ceil(rate*.5);
  function endProbe(){probe?.playback.restore();probe=null;attackMs=0}
  function finish(error){if(done)return;done=true;clearTimeout(deadline);endProbe();signal.removeEventListener('abort',abort);if(processor){processor.onaudioprocess=null;processor.disconnect()}source?.disconnect();gain?.disconnect();
   if(error){try{onCaptureAbort()}catch{};chunks=[];ring=[];reject(error);return}if(!heard||voicedMs<timing.minVoiceMs){try{onCaptureAbort()}catch{};chunks=[];ring=[];resolve(null);return}
   const samples=new Float32Array(count);let offset=0;for(const c of chunks){samples.set(c,offset);offset+=c.length}chunks=[];ring=[];try{if(streaming)onAudioEnd();resolve(encode(samples,rate))}catch(e){reject(e)}
  }
  function accept(t){heard=true;chunks=ring;count=ringCount;ring=[];ringCount=0;lastVoice=t;voicedMs=attackMs;endProbe();clearTimeout(deadline);deadline=setTimeout(()=>finish(),timing.maxSpeechMs);streaming=onSpeechStart()!==false;if(streaming&&onPcm)for(const frame of chunks)onPcm(frame,rate);if(streaming)onState('正在听你说 · 说完后自动回答','listening')}
  const abort=()=>finish(Error('通话已停止'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return}
  try{
   if(!Number.isFinite(rate)||rate<8000||rate>192000||context.state!=='running'||!context.createScriptProcessor)throw Error('当前浏览器无法开启通话录音，请使用文字提问');
   source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(1024,1,1);gain=context.createGain();gain.gain.value=0;
   processor.onaudioprocess=e=>{try{
    if(done)return;const frame=e.inputBuffer.getChannelData(0).slice(),ms=frame.length/rate*1000,t=now();let sum=0;for(const x of frame)sum+=x*x;const rms=Math.sqrt(sum/frame.length);
    const playback=input.playback?.active?input.playback:null,echo=(!!playback||t<(input.echoUntil||0))&&!!input.echo?.matches(frame);
    // The waiting listener learns steady room noise before it can cancel an answer.
    let calibrating=false;if(!heard&&!playback&&calibrationMs<180){calibrating=true;calibrationMs+=ms;ambient=Math.min(ambient,rms);ambientPeak=Math.max(ambientPeak,rms);if(calibrationMs>=180&&ambientPeak<=ambient*1.35&&ambient<.04)input.noiseFloor=ambient}
    if(!playback&&rms<.04){ambientWindow.push({rms,ms});ambientMs+=ms;while(ambientMs>1000&&ambientWindow.length>1)ambientMs-=ambientWindow.shift().ms;if(ambientMs>=850){const low=Math.min(...ambientWindow.map(x=>x.rms)),high=Math.max(...ambientWindow.map(x=>x.rms));if(high<=low*1.15)input.noiseFloor=low}}else{ambientWindow=[];ambientMs=0}
    const loud=rms>Math.max(.018,(input.noiseFloor||0)*2.4)&&!echo;
    if(heard){const accepted=echo?new Float32Array(frame.length):frame;chunks.push(accepted);count+=frame.length;if(streaming)onPcm?.(accepted,rate);if(loud){voicedMs+=ms;lastVoice=t}if(count>=rate*(timing.maxSpeechMs/1000+.55)||t-lastVoice>=timing.silenceMs)finish();return}
    // Keep silence in place of an obvious echo; never splice/trim a compressed audio container.
    ring.push(echo?new Float32Array(frame.length):frame);ringCount+=frame.length;while(ringCount>preRoll&&ring.length>1)ringCount-=ring.shift().length;
    if(probe){
     // Wait for acoustic tail to decay while Grace is briefly inaudible, then require ongoing speech.
     if(t-probe.at>=140){probe.voiceMs=loud&&!echo?probe.voiceMs+ms:0;if(probe.voiceMs>=100){attackMs+=probe.voiceMs;accept(t);return}}
     if(t-probe.at>=320){endProbe();cooldown=t+700}return;
    }
    if(playback&&!playback.supported){attackMs=0;return}
    if(!playback&&t<(input.echoUntil||0)){attackMs=0;return}
    attackMs=loud&&!echo&&!calibrating?attackMs+ms:0;
    if(playback){if(t>=cooldown&&attackMs>=160){probe={at:t,voiceMs:0,playback};playback.duck()}}
    else if(attackMs>=(monitor?250:120))accept(t);
   }catch(error){finish(error)}};
   source.connect(processor);processor.connect(gain);gain.connect(context.destination);
   if(!monitor)deadline=setTimeout(()=>finish(),timing.waitMs);
   if(!monitor)onState('通话中 · 我在听，说完会自动回答','listening');
  }catch(e){finish(e)}
 });
}
