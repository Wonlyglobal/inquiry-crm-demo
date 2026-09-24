// Captures one post-wake utterance. No network access; silence is never returned.
export function captureUtterance({signal,onState,mediaDevices=navigator.mediaDevices,Recorder=MediaRecorder,Context=AudioContext}){
 return new Promise((resolve,reject)=>{
  let stream,context,source,recorder,poll,deadline,done=false,heard=false,lastSound=0,voiced=0,size=0;const chunks=[];
  const abort=()=>finish(new Error('对话已停止'));
  function finish(error,blob){
   if(done)return;done=true;clearInterval(poll);clearTimeout(deadline);signal.removeEventListener('abort',abort);
   if(recorder){recorder.onstop=null;recorder.ondataavailable=null;recorder.onerror=null;if(recorder.state!=='inactive')recorder.stop()}
   stream?.getTracks().forEach(t=>t.stop());source?.disconnect();context?.close().catch(()=>{});
   error?reject(error):resolve(blob);
  }
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return}
  (async()=>{try{
   stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(done){stream.getTracks().forEach(t=>t.stop());return}
   const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus'].find(t=>Recorder.isTypeSupported(t));
   if(!mime)throw Error('浏览器不支持语音录制');
   context=new Context();await context.resume();if(done)return;
   if(context.state!=='running')throw Error('请点击开启聆听以启用音频');
   source=context.createMediaStreamSource(stream);const analyser=context.createAnalyser();analyser.fftSize=2048;source.connect(analyser);const samples=new Float32Array(analyser.fftSize);
   recorder=new Recorder(stream,{mimeType:mime,audioBitsPerSecond:64000});
   recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>2400000)finish(Error('录音过长，请缩短问题'))}};
   recorder.onerror=()=>finish(Error('录音失败，请重新开启聆听'));
   recorder.onstop=()=>finish(null,heard&&voiced>=200?new Blob(chunks,{type:mime}):null);
   // Recording begins only after voice energy is detected; waiting audio stays local.
   poll=setInterval(()=>{
    analyser.getFloatTimeDomainData(samples);let sum=0;for(const x of samples)sum+=x*x;
    const loud=Math.sqrt(sum/samples.length)>0.018,now=Date.now();
    if(loud){lastSound=now;voiced+=50;if(!heard){heard=true;recorder.start(250);clearTimeout(deadline);deadline=setTimeout(()=>recorder.state==='recording'&&recorder.stop(),60000);onState('正在听你说 · 停顿后自动提交至百炼北京','listening')}}
    if(heard&&now-lastSound>1400&&recorder.state==='recording')recorder.stop();
   },50);
   deadline=setTimeout(()=>finish(null,null),30000);
   onState('持续聆听中 · 说话后发送至百炼北京 · 可随时停止','listening');
  }catch(error){finish(error)}})();
 });
}
