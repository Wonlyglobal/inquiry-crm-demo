import {createWakeConversation} from './agent-wake.mjs?v=20260923-1';
// Explicit 百炼 dialogue only. Never receives CRM context or local assistant history.
export function mountConversation(host,{invoke,getPersona,onMessage,onMode,onTranscript,isAllowed,onSelectPersona}){
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
 const bar=el('div','');bar.className='agent-conversation-tools';
 const mode=el('select','');mode.setAttribute('aria-label','回答方式');for(const [v,t] of [['local','CRM资料分析'],['bailian','百炼通用推理']]){const o=el('option',t);o.value=v;mode.append(o)}
 const wakeButton=el('button','开启 Hello 唤醒');
 const mic=el('button','开始语音'),stop=el('button','停止'),replay=el('button','播放回答'),check=el('button','检查连接'),status=el('span','选择百炼可进行通用推理和语音对话。');
 for(const b of [wakeButton,mic,stop,replay,check])b.type='button';status.setAttribute('role','status');
 const note=el('p','百炼模式仅发送你主动输入的非机密问题、该模式近期对话、公开资料、背调样本分布及近30天权限内脱敏统计；录音发送至百炼转写。请勿输入客户机密或凭证。声音由AI生成，播报最多约1800字。');note.className='hint';
 bar.append(mode,wakeButton,mic,stop,replay,check,status,note);host.prepend(bar);
 let wake=null,wakeTransition=false;
 const histories=new Map();let ready=false,busy=false,version=0,recorder=null,stream=null,timer=null,player=null,audioUrl=null,lastTicket=null,controller=null;
 function state(text,orb='idle'){status.textContent=text;onMode(orb);sync()}
 function sync(){wakeButton.disabled=!ready||mode.value!=='bailian'||busy;wakeButton.textContent=wake?.isActive()?'关闭 Hello 唤醒':'开启 Hello 唤醒';mic.disabled=!ready||mode.value!=='bailian'||busy;mic.textContent=recorder?'结束并提问':'开始语音';stop.disabled=!busy&&!recorder&&!player&&!wake?.isActive();replay.disabled=!lastTicket||busy||!!recorder||mode.value!=='bailian';}
 async function call(body,signal){if(!isAllowed())throw Error('当前账号不可用');return invoke(body,signal)}
 function release(){clearTimeout(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null}
 function stopAll({keepWake=false}={}){if(!keepWake)wake?.stop();version++;controller?.abort();controller=null;if(recorder){recorder.onstop=null;try{recorder.stop()}catch{}recorder=null}release();if(player){player.pause();player=null}if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null}busy=false;state('已停止')}
 async function checkConnection(){check.disabled=true;try{const s=await call({action:'status'});ready=!!s.enabled&&!!s.configured;state(!s.configured?'尚未配置百炼密钥':!s.enabled?'数据范围等待批准启用':`百炼已配置 · ${s.model}（实际调用待验证）`)}catch(e){ready=false;state(e.message)}finally{check.disabled=false;sync()}}
 async function playBlob(blob,epoch){
  if(version!==epoch)throw Error('对话已停止');audioUrl=URL.createObjectURL(blob);player=new Audio(audioUrl);
  await new Promise((resolve,reject)=>{const current=player;current.onended=resolve;current.onerror=()=>reject(Error('声音播放失败'));controller?.signal.addEventListener('abort',()=>reject(Error('对话已停止')),{once:true});current.play().then(()=>{if(version===epoch){busy=false;state('正在说话 · 可点击停止','speaking')}}).catch(()=>reject(Error('请点击播放回答以允许声音播放')))});
  if(version===epoch){player=null;URL.revokeObjectURL(audioUrl);audioUrl=null;busy=false;state('播报结束')}
 }
 async function speak(ticket,epoch,persona){
  if(!ticket||version!==epoch)return;controller=new AbortController();busy=true;state('正在生成语音…','thinking');
  try{const blob=await call({action:'speech',persona,ticket},controller.signal);await playBlob(blob,epoch)}catch(e){if(version===epoch){busy=false;state(e.message)}if(wake?.isActive())throw e}
 }
 async function ask(question,{voice=false}={}){
  if(mode.value!=='bailian')return false;
  if(!ready){state('请先完成百炼配置并检查连接');return true}
  if(busy||recorder)return true;
  stopAll({keepWake:voice});const epoch=version,persona=getPersona();controller=new AbortController();busy=true;lastTicket=null;state('正在思考…','thinking');onMessage('user',question);onTranscript('');
  try{const result=await call({action:'chat',persona,question,history:(histories.get(persona)||[]).slice(-8)},controller.signal);if(version!==epoch||persona!==getPersona())return true;
   histories.set(persona,[...(histories.get(persona)||[]),{role:'user',content:question},{role:'assistant',content:result.answer}].slice(-8));onMessage('assistant',result.answer+'\n\n— 百炼 · '+result.model+' · 仅使用权限内脱敏统计，无客户明细');lastTicket={ticket:result.ticket,persona};busy=false;state('回答完成');if(voice)await speak(result.ticket,epoch,persona);
  }catch(e){if(version===epoch){busy=false;onMessage('assistant','百炼未完成回答：'+e.message+'。没有将本地规则回答冒充模型回答。');state('回答未完成，可重试');if(wake?.isActive())throw e}}finally{if(version===epoch){busy=false;sync()}}return true;
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
 mode.onchange=()=>{stopAll();lastTicket=null;state(mode.value==='bailian'?'仅输入非机密内容；按开始语音可说话':'CRM资料仅在本地分析');if(mode.value==='bailian')checkConnection()};
 wake=createWakeConversation({Recognition:window.SpeechRecognition||window.webkitSpeechRecognition,onState:state,
  onWake:async persona=>{
   wakeTransition=true;try{onSelectPersona(persona)}finally{wakeTransition=false}
   if(getPersona()!==persona)throw Error('当前对话未结束，无法切换智能体');
   const epoch=version;controller=new AbortController();busy=true;state('正在问候…','thinking');onMessage('assistant','Hello Chloe');
   try{const blob=await call({action:'greeting',persona},controller.signal);await playBlob(blob,epoch)}catch(e){busy=false;throw e}
  },onQuestion:text=>ask(text,{voice:true})});
 wakeButton.onclick=async()=>{if(wake.isActive()){stopAll();return}if(!ready)return;stopAll();try{await wake.start()}catch(e){state(e.message)}};
 mic.onclick=record;stop.onclick=()=>stopAll();check.onclick=checkConnection;replay.onclick=()=>{if(lastTicket){stopAll();speak(lastTicket.ticket,version,lastTicket.persona)}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll()});window.addEventListener('pagehide',stopAll);sync();
 return {ask,isModel:()=>mode.value==='bailian',busy:()=>busy||!!recorder,reset(){stopAll({keepWake:wakeTransition});lastTicket=null;sync()},clear(){histories.delete(getPersona());stopAll();lastTicket=null;sync()}};
}
