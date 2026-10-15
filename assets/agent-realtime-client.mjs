import {pcmEncoder,encodePcm,decodePcm,createPcmPlayer} from './agent-realtime-audio.mjs?v=20261015-realtime2';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});promise.catch(()=>{});return {promise,resolve,reject}};
// A provider key never enters this module. The CRM session token is sent once over TLS,
// in the first frame, never in a URL, local storage, transcript, or diagnostics.
export function createRealtimeClient({url,getToken,Socket=globalThis.WebSocket,playerFactory=createPcmPlayer,onFailure=()=>{}}){
 let socket=null,opening=null,closed=false,rotating=false,resume=null,lastTurn=0,current=null,input=null,ping=null;
 const send=d=>{if(socket?.readyState!==1)throw Error('实时语音连接已断开');if(socket.bufferedAmount>256000)throw Error('实时语音发送积压');socket.send(JSON.stringify(d))};
 function discard(f,error=Error('本轮已停止')){if(!f||f.cancelled)return;f.cancelled=true;clearTimeout(f.timer);f.pending=[];f.bytes=0;f.heard.reject(error);f.done.reject(error);f.player?.stop(error);if(current===f)current=null}
 function cancel(f=current){if(!f||f.cancelled)return;try{if(socket?.readyState===1&&!rotating)send({type:'cancel',turn:f.id})}catch{}discard(f)}
 function fail(message){if(closed)return;const e=Error(message);opening?.reject(e);opening=null;discard(current,e);close();onFailure(message)}
 async function connect(signal){
  if(closed||signal?.aborted)throw Error('通话已停止');if(socket?.readyState===1&&!opening)return;if(opening)return opening.promise;
  const pending=deferred();opening=pending;let token;
  try{token=await getToken();if(closed||signal?.aborted)throw Error('通话已停止');const ws=new Socket(url);socket=ws;const timeout=setTimeout(()=>fail('实时语音接通超时'),12000);pending.promise.finally(()=>clearTimeout(timeout)).catch(()=>{});
   ws.onopen=()=>{if(socket!==ws||closed)return;ws.send(JSON.stringify({type:'auth',token,...(resume?{resume}:{})}));token=''};
   ws.onmessage=event=>{if(socket!==ws||closed)return;try{
    if(typeof event.data!=='string'||event.data.length>200000)throw Error('实时语音事件超限');const d=JSON.parse(event.data),f=current;
    if(d.type==='ready'){if(!Number.isSafeInteger(d.lastTurn)||d.lastTurn<0||f&&f.id!==d.lastTurn+1)throw Error('实时通话轮次不一致');lastTurn=d.lastTurn;opening=null;rotating=false;resume=null;pending.resolve();if(f)send({type:'turn.start',turn:f.id});return}
    if(d.type==='rotate'){if(!f||f.ready||!d.resume?.data||!d.resume?.signature)throw Error('实时语音续接状态无效');resume=d.resume;rotating=true;socket=null;ws.close();void connect(signal).catch(e=>fail(e.message));return}
    if(d.type==='closed'||d.type==='error')throw Error(d.message||'实时语音连接中断');
    if(!f||f.cancelled||d.turn!==f.id)return;
    if(d.type==='turn.ready'){f.ready=true;lastTurn=f.id;flush(f)}
    else if(d.type==='ignored'){f.heard.resolve({text:'',ignored:d.ignored||'uncertain'});clearTimeout(f.timer);if(current===f)current=null;f.cancelled=true;f.pending=[]}
    else if(d.type==='transcript'){if(typeof d.text!=='string'||d.text.length>3000||typeof d.native!=='boolean')throw Error('实时转写格式无效');clearTimeout(f.timer);f.heard.resolve({text:d.text,native:d.native,voiceProof:d.voiceProof,realtimeTurn:f.id});if(!d.native){f.cancelled=true;if(current===f)current=null}}
    else if(d.type==='audio'){if(!f.player||d.sampleRate!==24000)throw Error('实时音频时序无效');f.player.push(decodePcm(d.audio))}
    else if(d.type==='done'){if(typeof d.answer!=='string'||!d.answer.trim()||d.answer.length>3000)throw Error('实时回答没有内容');f.done.resolve(d.answer)}
   }catch(e){fail(e.message)}};
   ws.onerror=()=>{if(socket===ws)fail('实时语音连接失败')};ws.onclose=()=>{if(socket===ws&&!closed)fail('实时语音连接已断开，请重新拨通')};
   await pending.promise;
  }catch(e){pending.reject(e);if(opening===pending)opening=null;throw e}finally{token=''}
 }
 function flush(f){if(!f.ready||f.cancelled||current!==f)return;
  // Group callbacks into 100–200ms PCM frames. A slow handshake must not flush
  // dozens of tiny audio callbacks into the gateway's one-second rate window.
  while(f.bytes>=3200||f.ended&&f.bytes){const size=f.bytes>=6400?6400:f.ended?f.bytes:3200,bytes=new Uint8Array(size);let at=0;while(at<size){const first=f.pending[0],take=Math.min(first.length,size-at);bytes.set(first.subarray(0,take),at);at+=take;f.bytes-=take;if(take===first.length)f.pending.shift();else f.pending[0]=first.slice(take)}send({type:'audio.append',turn:f.id,seq:++f.seq,audio:encodePcm(bytes)})}
  if(f.ended&&!f.committed){f.committed=true;send({type:'audio.commit',turn:f.id})}
 }
 function createFeed(){
  if(closed||socket?.readyState!==1||opening)throw Error('实时语音连接未就绪');if(current)cancel();
  const f={id:lastTurn+1,seq:0,ready:false,ended:false,committed:false,cancelled:false,pending:[],bytes:0,heard:deferred(),done:deferred(),encoder:null,player:null};current=f;
  // Includes the maximum utterance, bounded speaker verification, and transcription.
  f.timer=setTimeout(()=>fail('实时语音识别超时'),75000);lastTurn=f.id;send({type:'turn.start',turn:f.id});
  return {id:f.id,
   push(frame,rate){if(f.cancelled)return;if(f.ended)throw Error('本轮录音已结束');f.encoder??=pcmEncoder(rate);const pcm=f.encoder(frame);for(let i=0;i<pcm.length;i+=6400){const part=pcm.slice(i,i+6400);f.bytes+=part.length;if(f.bytes>256000)throw Error('实时音频积压，请重新拨通');f.pending.push(part)}flush(f)},
   end(){if(!f.cancelled){f.ended=true;flush(f)}},cancel(){cancel(f)},heard:f.heard.promise};
 }
 async function respond(id,signal,onStart=()=>{}){
  const f=current;if(!f||f.id!==id||f.cancelled)throw Error('实时回答已停止');const abort=()=>cancel(f);signal.addEventListener('abort',abort,{once:true});let timer;
  try{if(signal.aborted)throw Error('通话已停止');f.player=playerFactory(input,{onStart});send({type:'response.start',turn:id});timer=setTimeout(()=>{discard(f,Error('实时回答超时'));onFailure('实时回答超时')},45000);const answer=await f.done.promise;await f.player.finish();if(signal.aborted||f.cancelled)throw Error('通话已停止');send({type:'response.heard',turn:id});f.cancelled=true;if(current===f)current=null;return answer}
  catch(e){cancel(f);throw e}finally{clearTimeout(timer);signal.removeEventListener('abort',abort)}
 }
 function close(){if(closed)return;closed=true;clearInterval(ping);discard(current);opening?.reject(Error('通话已停止'));opening=null;try{socket?.close()}catch{}socket=null;resume=null;input=null}
 return {async open(prepared,{signal}={}){input=prepared;const abort=()=>close();signal?.addEventListener('abort',abort,{once:true});try{await connect(signal);ping=setInterval(()=>{try{if(socket?.readyState===1&&!rotating)send({type:'ping'})}catch(e){fail(e.message)}},20000)}catch(e){close();throw e}},createFeed,respond,cancel,close};
}
