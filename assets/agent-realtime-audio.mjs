// Streaming PCM codec/player; no account, network, storage or document access.
export function pcmEncoder(sourceRate){
 let tail=new Float32Array(0),base=0,nextIndex=0,total=0;
 if(!Number.isInteger(sourceRate)||sourceRate<8000||sourceRate>192000)throw Error('录音采样率不支持');
 return frame=>{const data=new Float32Array(tail.length+frame.length);data.set(tail);data.set(frame,tail.length);total+=frame.length;const endIndex=Math.floor(total*16000/sourceRate),bytes=new Uint8Array((endIndex-nextIndex)*2),view=new DataView(bytes.buffer);
  // Derive every boundary from integer sample counts; fractional phase must not drift
  // across 1024-frame callbacks (notably Safari's 44.1kHz AudioContext).
  for(let i=nextIndex;i<endIndex;i++){const at=Math.floor(i*sourceRate/16000),end=Math.max(at+1,Math.floor((i+1)*sourceRate/16000));let sum=0;for(let j=at;j<end;j++)sum+=data[j-base];const x=Math.max(-1,Math.min(1,sum/(end-at)));view.setInt16((i-nextIndex)*2,x*(x<0?32768:32767),true)}
  const consumed=Math.floor(endIndex*sourceRate/16000);tail=data.slice(consumed-base);base=consumed;nextIndex=endIndex;return bytes;
 };
}
export function encodePcm(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)}
export function decodePcm(text){if(typeof text!=='string'||text.length>180000||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw Error('语音分段无效');const s=atob(text);if(s.length%2)throw Error('语音分段不完整');return Uint8Array.from(s,c=>c.charCodeAt(0))}
export function createPcmPlayer(input,{onStart=()=>{}}={}){
 const ctx=input.context,bus=ctx.createGain(),playback=input.attachPcmPlayback(bus);let next=0,closed=false,finished=false,started=false,resolveDone,rejectDone,firstTimer;const sources=new Set();
 const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject});done.catch(()=>{});
 const release=()=>{playback.release();bus.disconnect();clearTimeout(firstTimer)};
 const settle=()=>{if(finished&&!sources.size&&!closed){closed=true;release();resolveDone()}};
 return {
  push(bytes){if(closed||finished)throw Error('语音播放已结束');if(bytes.length%2||bytes.length>128000)throw Error('语音分段无效');const samples=bytes.length/2;if(!samples)return;
   const at=Math.max(ctx.currentTime+.04,next);if(at-ctx.currentTime+samples/24000>30||sources.size>500)throw Error('语音播放积压，请重试');
   const buffer=ctx.createBuffer(1,samples,24000),out=buffer.getChannelData(0),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<samples;i++)out[i]=view.getInt16(i*2,true)/32768;
   const source=ctx.createBufferSource();source.buffer=buffer;source.connect(bus);sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();settle()};source.start(at);next=at+samples/24000;
   if(!started){started=true;firstTimer=setTimeout(()=>{if(!closed)onStart()},Math.max(0,(at-ctx.currentTime)*1000))}
  },
  finish(){finished=true;if(!started){this.stop();return done}settle();return done},
  stop(){if(closed)return;closed=true;for(const s of sources){s.onended=null;try{s.stop()}catch{}s.disconnect()}sources.clear();release();rejectDone(Error('语音已打断'))},done
 };
}
