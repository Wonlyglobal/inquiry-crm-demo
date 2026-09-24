import {captureUtterance} from './agent-utterance.mjs?v=20260924-2';
import {playWithDeadline} from './agent-audio.mjs?v=20260924-1';
import {prepareMicrophone} from './agent-microphone.mjs?v=20260923-1';
import {seoContextLabel,socialContextLabel} from './agent-seo-status.mjs?v=20260923-3';
import {createWakeConversation} from './agent-wake.mjs?v=20260924-3';
// Explicit 百炼 dialogue only. Never receives CRM context or local assistant history.
export function mountConversation(host,{invoke,getPersona,onMessage,onMode,onTranscript,isAllowed,onSelectPersona,onStatus,onMaterials}){
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
 const bar=el('div','');bar.className='agent-conversation-tools';
 const mode=el('select','');mode.setAttribute('aria-label','回答方式');for(const [v,t] of [['local','CRM资料分析'],['bailian','智能推理']]){const o=el('option',t);o.value=v;mode.append(o)}
 const wakeButton=el('button','开启 Hello 唤醒'),installWake=el('button','安装本机语音包');
 const mic=el('button','开始语音'),stop=el('button','停止'),replay=el('button','播放回答'),check=el('button','检查连接'),status=el('span','可进行知识问答、业务分析和语音对话。');
 for(const b of [wakeButton,installWake,mic,stop,replay,check])b.type='button';status.setAttribute('role','status');
 const note=el('p','智能推理仅发送你主动输入的非机密问题、该模式近期对话、公开资料、背调样本分布、近30天权限内脱敏统计，以及已批准的SEO与社媒只读摘要；Hello唤醒前录音不上传；唤醒后说话片段发送至阿里云语音服务转写；切换浏览器标签页继续，播报期间暂停录音，停止或退出私人空间即结束。请勿输入客户机密或凭证。声音由AI生成；语音回答优先播报简短结果，完整信息显示在窗口。');note.className='hint';
 stop.setAttribute('data-voice-stop','true');const startWake=el('button','恢复聆听');startWake.type='button';startWake.setAttribute('data-voice-start','true');startWake.hidden=true;bar.append(startWake);bar.append(mode,installWake,wakeButton,mic,stop,replay,check,status,note);host.prepend(bar);
 let wake=null,wakeTransition=false,installing=false;const greetings=new Map(),greetingLoads=new Map();
 const histories=new Map();let ready=false,busy=false,version=0,recorder=null,stream=null,timer=null,player=null,audioUrl=null,lastTicket=null,lastGreeting=null,controller=null;
 function state(text,orb='idle'){text=String(text).replace(/百炼北京/g,'语音服务').replace(/百炼/g,'智能服务');status.textContent=text;onStatus?.(text);onMode(orb);sync()}
 function sync(){installWake.disabled=installing||busy||!!recorder||!!wake?.isActive();installWake.textContent=installing?'正在准备语音包…':'安装本机语音包';wakeButton.disabled=installing||!ready||mode.value!=='bailian'||busy;wakeButton.textContent=wake?.isActive()?'关闭 Hello 唤醒':'开启 Hello 唤醒';mic.disabled=!ready||mode.value!=='bailian'||busy;mic.textContent=recorder?'结束并提问':'开始语音';stop.disabled=!installing&&!busy&&!recorder&&!player&&!wake?.isActive();replay.disabled=(!lastTicket&&!lastGreeting)||busy||!!recorder||mode.value!=='bailian';}
 async function call(body,signal){if(!isAllowed())throw Error('当前账号不可用');
  const limit=body?.action==='greeting'?12000:body?.action==='speech'?20000:70000;
  const deadline=new AbortController();let timeout=false;const timer=setTimeout(()=>{timeout=true;deadline.abort()},limit);
  const combined=signal?AbortSignal.any([signal,deadline.signal]):deadline.signal;
  try{return await Promise.race([invoke(body,combined),new Promise((_,reject)=>{const fail=()=>reject(Error(timeout?'语音或回答服务超时，请重试':'对话已停止'));if(combined.aborted)fail();else combined.addEventListener('abort',fail,{once:true})})])}finally{clearTimeout(timer)}
 }
 function release(){clearTimeout(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null}
 function stopAll({keepWake=false}={}){if(!keepWake)wake?.stop();installing=false;version++;controller?.abort();controller=null;if(recorder){recorder.onstop=null;try{recorder.stop()}catch{}recorder=null}release();if(player){player.pause();player=null}if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null}busy=false;state('已停止')}
 async function greeting(persona){if(greetings.has(persona))return greetings.get(persona);if(!greetingLoads.has(persona))greetingLoads.set(persona,call({action:'greeting',persona}).then(blob=>{greetings.set(persona,blob);return blob}).finally(()=>greetingLoads.delete(persona)));return greetingLoads.get(persona)}
 async function checkConnection(){const epoch=version;check.disabled=true;try{const s=await call({action:'status'});if(epoch!==version)return;ready=!!s.enabled&&!!s.configured;state(!s.configured?'尚未配置百炼密钥':!s.enabled?'数据范围等待批准启用':'连接已就绪')}catch(e){if(epoch===version){ready=false;state(e.message)}}finally{check.disabled=false;sync()}}
 async function playBlob(blob,epoch){
  if(version!==epoch)throw Error('对话已停止');audioUrl=URL.createObjectURL(blob);player=new Audio(audioUrl);
  const current=player,url=audioUrl;
  try{await playWithDeadline(current,controller?.signal,{onPlaying:()=>{if(version===epoch){busy=false;state('正在说话 · 可点击停止','speaking')}}})}
  finally{URL.revokeObjectURL(url);if(version===epoch){player=null;audioUrl=null;busy=false}}
  if(version===epoch)state('播报结束');
 }
 async function speak(ticket,epoch,persona){
  if(!ticket||version!==epoch)return;controller=new AbortController();busy=true;state('正在生成语音…','thinking');
  try{const blob=await call({action:'speech',persona,ticket},controller.signal);await playBlob(blob,epoch)}catch(e){if(version===epoch){busy=false;state(e.message)}if(wake?.isActive())throw e}
 }
 async function ask(question,{voice=false}={}){
  if(mode.value!=='bailian')return false;
  if(!ready){state('请先完成百炼配置并检查连接');return true}
  if(busy||recorder)return true;
  stopAll({keepWake:voice});const epoch=version,persona=getPersona();controller=new AbortController();busy=true;lastTicket=null;state('收到，正在整理回答…','thinking');const progress=setTimeout(()=>{if(version===epoch&&busy)state('仍在处理你的问题，完成后会立即显示；你可以随时停止','thinking')},4500);onMessage('user',question);onTranscript('');
  try{const result=await call({action:'chat',persona,question,voice,history:(histories.get(persona)||[]).slice(-8)},controller.signal);if(version!==epoch||persona!==getPersona())return true;
   if(result.provider!=='internal')histories.set(persona,[...(histories.get(persona)||[]),{role:'user',content:question},{role:'assistant',content:result.answer}].slice(-8));onMessage('assistant',result.answer+'\n\n'+(result.context?.route==='materials'?' 物料库检索':result.context?.route==='general'?' 通用知识':result.context?.route==='research'?' 公开资料检索':'权限内业务资料'+seoContextLabel(result.context)+socialContextLabel(result.context)));if(result.materials?.length)onMaterials?.(result.materials);lastTicket={ticket:result.ticket,persona};busy=false;state('回答完成');if(voice)await speak(result.ticket,epoch,persona);
  }catch(e){if(version===epoch){busy=false;onMessage('assistant','本次回答未完成：'+String(e.message).replace(/百炼/g,'智能服务')+'。请重试。');state('回答未完成，可重试');if(wake?.isActive())throw e}}finally{clearTimeout(progress);if(version===epoch){busy=false;sync()}}return true;
 }
 async function record(){
  if(recorder){recorder.stop();return}
  if(!ready||busy||mode.value!=='bailian')return;
  stopAll();const epoch=version,persona=getPersona();busy=true;state('等待麦克风授权…');
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('此浏览器不支持录音，请使用支持WebM/OGG录音的最新版Chrome');
   const acquired=await navigator.mediaDevices.getUserMedia({audio:true});if(version!==epoch){acquired.getTracks().forEach(t=>t.stop());return}stream=acquired;
   const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('此浏览器没有受支持的录音格式');
   recorder=new MediaRecorder(stream,{mimeType:mime});const chunks=[];let size=0;const current=recorder;
   current.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>2400000&&current.state==='recording')current.stop()}};
   current.onstop=async()=>{recorder=null;release();if(version!==epoch)return;busy=true;state('正在转写…','thinking');controller=new AbortController();try{const form=new FormData();form.append('persona',persona);form.append('audio',new Blob(chunks,{type:mime}),'speech.'+(mime.includes('ogg')?'ogg':'webm'));const data=await call(form,controller.signal);if(version!==epoch)return;if(!data.text?.trim())throw Error('没有识别到说话内容');onTranscript(data.text);busy=false;await ask(data.text,{voice:true})}catch(e){if(version===epoch){busy=false;state(e.message)}}};
   current.onerror=()=>{stopAll();state('录音失败，请重试')};current.start(1000);busy=false;state('正在聆听 · 最长60秒，点击“结束并提问”','listening');timer=setTimeout(()=>{if(current.state==='recording')current.stop()},60000);
  }catch(e){release();busy=false;state(e.name==='NotAllowedError'?'麦克风未授权，可继续文字提问':e.message)}
 }
 async function enter(){
  // Opening Grace's room is the user's explicit voice-start action.
  // Wake-triggered persona selection must not restart or cancel its own greeting.
  if(wakeTransition||getPersona()!=='Grace'||!isAllowed()||document.hidden)return;
  stopAll();const epoch=version;mode.value='bailian';ready=false;state('正在为 Grace 准备语音唤醒…');
  await checkConnection();if(epoch!==version||!ready||document.hidden)return;
  void greeting('Grace').catch(()=>{});installing=true;sync();
  try{state('正在请求麦克风权限…');await prepareMicrophone(navigator.mediaDevices);if(epoch!==version||document.hidden)return;await wake.install();if(epoch!==version||document.hidden)return;await wake.start()}
  catch(e){if(epoch===version)state(e.message)}
  finally{if(epoch===version){installing=false;sync()}}
 }
 mode.onchange=()=>{stopAll();lastTicket=null;state(mode.value==='bailian'?'仅输入非机密内容；按开始语音可说话':'CRM资料仅在本地分析');if(mode.value==='bailian')checkConnection()};
 async function readQuestion(signal){
  const epoch=version,persona=getPersona();
  const blob=await captureUtterance({signal,onState:state});
  if(signal.aborted||epoch!==version||!isAllowed())throw Error('对话已停止');
  if(!blob)return '';
  state('正在识别你的问题…','thinking');
  const form=new FormData();form.append('persona',persona);form.append('audio',blob,'speech.'+(blob.type.includes('ogg')?'ogg':'webm'));
  const result=await call(form,signal);
  if(signal.aborted||epoch!==version)throw Error('对话已停止');
  return result.text?.trim()||'';
 }
 wake=createWakeConversation({readQuestion,Recognition:window.SpeechRecognition||window.webkitSpeechRecognition,onState:state,
  onWake:async persona=>{
   wakeTransition=true;try{onSelectPersona(persona)}finally{wakeTransition=false}
   if(getPersona()!==persona)throw Error('当前对话未结束，无法切换智能体');
   const epoch=version;controller=new AbortController();busy=true;lastTicket=null;lastGreeting=persona;state("I'm here, Chloe.",'speaking');onMessage('assistant',persona==='Grace'?"I'm here, Chloe.":'Hello Chloe');
   try{const blob=await greeting(persona);if(version!==epoch)return;state('问候已准备，正在播放…','speaking');await playBlob(blob,epoch)}catch(e){if(version===epoch){busy=false;onMessage('assistant','已听到你的唤醒词，但问候声音未完成：'+e.message+'。可以继续说出问题。')}throw e}
  },onQuestion:text=>ask(text,{voice:true})});
 installWake.onclick=async()=>{if(installing)return;stopAll();installing=true;sync();try{await wake.install()}catch(e){state(e.message)}finally{installing=false;sync()}};
 startWake.onclick=async()=>{if(wake.isActive())return;if(mode.value!=='bailian'||!ready){mode.value='bailian';await checkConnection()}if(ready)await wakeButton.onclick()};
 wakeButton.onclick=async()=>{if(wake.isActive()){stopAll();return}if(!ready)return;stopAll();const epoch=version;try{state('正在请求麦克风权限…');await prepareMicrophone(navigator.mediaDevices);if(epoch!==version||document.hidden)return;await wake.start()}catch(e){state(e.message)}};
 mic.onclick=record;stop.onclick=()=>stopAll();check.onclick=checkConnection;replay.onclick=async()=>{if(lastTicket){stopAll();speak(lastTicket.ticket,version,lastTicket.persona)}else if(lastGreeting){const persona=lastGreeting;stopAll();const epoch=version;controller=new AbortController();busy=true;state('正在重播问候…','thinking');try{const blob=await greeting(persona);if(version!==epoch)return;await playBlob(blob,epoch)}catch(e){if(version===epoch)state(e.message)}finally{if(version===epoch){busy=false;sync()}}}};
 // An explicitly started conversation continues across browser tab switches.
 window.addEventListener('pagehide',stopAll);sync();
 return {ask,enter,isModel:()=>mode.value==='bailian',busy:()=>busy||!!recorder,reset(){stopAll({keepWake:wakeTransition});lastTicket=null;lastGreeting=null;sync()},clear(){histories.delete(getPersona());stopAll();lastTicket=null;lastGreeting=null;sync()}};
}
