import {createCompatibleRecorder} from './grace-recorder.mjs?v=20261006-1';

// This is a local sound-level guide, not speaker recognition or a speech validator.
// The company service still decides whether the sample contains enough usable speech.
export function enrollmentProgress({elapsed,voiced,silence}){
 const enough=voiced>=5,expired=elapsed>=20;
 return {stop:expired||(elapsed>=8&&enough&&silence>=.6),
  insufficient:expired&&voiced<3,
  message:`正在录入 · ${Math.min(20,Math.floor(elapsed))}/20 秒 · 检测到声音 ${voiced.toFixed(1)} 秒。`+
   (enough?'请说完这句话后停顿，系统会自动提交。':'请连续说话，例如介绍今天的工作；声音不足会继续等待。')};
}

export async function captureEnrollment({signal,onProgress=()=>{},mediaDevices=globalThis.navigator?.mediaDevices,
 Context=globalThis.AudioContext||globalThis.webkitAudioContext,makeRecorder=createCompatibleRecorder,
 now=()=>performance.now(),every=setInterval,clearEvery=clearInterval}){
 let stream,recorder,context,source,analyser,tick;
 const stopped=()=>{if(signal?.aborted)throw Error('录音已停止')};
 try{
  stopped();stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});stopped();
  if(!Context)throw Error('当前设备无法检查录音音量，请换用支持录音的浏览器');
  context=new Context();await context.resume();stopped();if(context.state!=='running')throw Error('请再次点击注册声纹，启用录音');
  source=context.createMediaStreamSource(stream);analyser=context.createAnalyser();analyser.fftSize=2048;source.connect(analyser);
  recorder=await makeRecorder(stream);stopped();
  return await new Promise((resolve,reject)=>{
   const chunks=[],samples=new Float32Array(analyser.fftSize);let done=false,voiced=0,silence=0,last=now(),start=last,insufficient=false;
   const finish=error=>{if(done)return;done=true;clearEvery(tick);signal?.removeEventListener('abort',abort);recorder.onstop=recorder.ondataavailable=recorder.onerror=null;
    if(recorder.state==='recording')recorder.stop();
    if(error)reject(error);else resolve({blob:new Blob(chunks,{type:recorder.mimeType}),mime:recorder.mimeType});};
   const abort=()=>finish(Error('录音已停止'));signal?.addEventListener('abort',abort,{once:true});
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   recorder.onstop=()=>finish(insufficient?Error('检测到的声音不足，未提交登记。请靠近麦克风，在安静环境连续说 5 到 10 秒后重试。'):null);
   recorder.onerror=()=>finish(Error('录音失败，未提交登记，请重试'));
   try{recorder.start(500);onProgress(enrollmentProgress({elapsed:0,voiced:0,silence:0}).message);
    tick=every(()=>{const at=now(),dt=Math.max(0,Math.min(.2,(at-last)/1000));last=at;analyser.getFloatTimeDomainData(samples);
     const rms=Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length);
     if(rms>.005){voiced+=dt;silence=0}else silence+=dt;
     const progress=enrollmentProgress({elapsed:(at-start)/1000,voiced,silence});onProgress(progress.message);
     if(progress.stop){insufficient=progress.insufficient;clearEvery(tick);recorder.stop()}
    },100);
   }catch(error){finish(error)}
  });
 }finally{
  clearEvery(tick);if(recorder?.state==='recording'){recorder.onstop=recorder.ondataavailable=recorder.onerror=null;recorder.stop()}
  source?.disconnect();analyser?.disconnect();stream?.getTracks().forEach(t=>t.stop());if(context&&context.state!=='closed')await context.close();
 }
}
