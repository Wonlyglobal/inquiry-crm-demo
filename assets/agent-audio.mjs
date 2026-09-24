// Bound media startup and completion; always detach listeners on stop/failure.
export function playWithDeadline(audio,signal,{startMs=8000,endMs=120000,onPlaying=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  let settled=false,started=false;
  let timer=setTimeout(()=>finish(Error('声音启动超时，请检查声音输出或点击重播')),startMs);
  const abort=()=>finish(Error('对话已停止'));
  function finish(error){if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);audio.onended=null;audio.onerror=null;audio.onplaying=null;if(error){audio.pause();reject(error)}else resolve()}
  audio.onended=()=>finish();audio.onerror=()=>finish(Error('声音播放失败，请重试'));
  audio.onplaying=()=>{if(started||settled)return;started=true;clearTimeout(timer);timer=setTimeout(()=>finish(Error('声音播放超时')),endMs);onPlaying()};
  if(signal?.aborted){abort();return}signal?.addEventListener('abort',abort,{once:true});
  try{Promise.resolve(audio.play()).catch(()=>finish(Error('浏览器未允许自动播放，请点击播放回答')))}catch{finish(Error('声音播放失败，请重试'))}
 });
}
