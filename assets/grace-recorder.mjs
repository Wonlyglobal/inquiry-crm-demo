// PCM fallback for iPhone WebViews that cannot produce WebM/OGG. Audio stays in
// memory until the existing authenticated transcription flow submits the clip.
export const audioExtension = mime => mime.includes('wav') ? 'wav' : mime.includes('ogg') ? 'ogg' : 'webm';
export function encodeWav(samples, sampleRate) {
 const rate=16000, count=Math.floor(samples.length*rate/sampleRate);
 const buffer=new ArrayBuffer(44+count*2), view=new DataView(buffer);
 const text=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
 text(0,'RIFF');view.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 text(36,'data');view.setUint32(40,count*2,true);
 for(let i=0;i<count;i++) {const start=Math.floor(i*sampleRate/rate),end=Math.min(samples.length,Math.max(start+1,Math.floor((i+1)*sampleRate/rate)));let sum=0;for(let j=start;j<end;j++)sum+=samples[j];const v=Math.max(-1,Math.min(1,sum/(end-start)));view.setInt16(44+i*2,v*(v<0?32768:32767),true)}
 return new Blob([buffer],{type:'audio/wav'});
}
export async function createCompatibleRecorder(stream,{Recorder=globalThis.MediaRecorder,Context=globalThis.AudioContext||globalThis.webkitAudioContext}={}) {
 const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus'].find(t=>Recorder?.isTypeSupported(t));
 if(mime)return new Recorder(stream,{mimeType:mime,audioBitsPerSecond:64000});
 if(!Context)throw Error('当前设备不支持录音，请用文字提问');
 const context=new Context();
 try{await context.resume();if(context.state!=='running')throw Error('请点击语音按钮启用录音')}catch(e){await context.close();throw e}
 const source=context.createMediaStreamSource(stream),processor=context.createScriptProcessor(4096,1,1),gain=context.createGain();gain.gain.value=0;
 let chunks=[],count=0,closed=false;
 const recorder={mimeType:'audio/wav',state:'inactive',ondataavailable:null,onstop:null,onerror:null,
  start(){if(closed)throw Error('录音已结束');recorder.state='recording';source.connect(processor);processor.connect(gain);gain.connect(context.destination)},
  stop(){if(closed)return;closed=true;recorder.state='inactive';processor.disconnect();source.disconnect();gain.disconnect();void context.close();
   const samples=new Float32Array(count);let offset=0;for(const chunk of chunks){samples.set(chunk,offset);offset+=chunk.length}chunks=[];
   const blob=encodeWav(samples,context.sampleRate);queueMicrotask(()=>{recorder.ondataavailable?.({data:blob});recorder.onstop?.()});
  }};
 processor.onaudioprocess=e=>{if(recorder.state!=='recording')return;const data=e.inputBuffer.getChannelData(0);const remaining=Math.floor(context.sampleRate*60)-count;if(remaining>0){const chunk=data.slice(0,remaining);chunks.push(chunk);count+=chunk.length}if(count>=context.sampleRate*60)recorder.stop()};
 return recorder;
}
