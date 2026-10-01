// Keeps the latest turns within the server limits (20 messages, 40,000 characters; each message ≤6,000).
export function fitHistory(list,maxChars=38000){const out=[];let n=0;for(const m of [...list].reverse().slice(0,20)){const c=String(m.content).slice(0,6000);if(n+c.length>maxChars)break;n+=c.length;out.unshift({role:m.role,content:c})}if(out[0]?.role==='assistant')out.shift();return out}
// "Open it for me" actions from the agent: CRM pages, competitors' official pages, keyword searches.
// Only https links without credentials are opened; a blank window reserved during the click is reused
// so the browser does not block it, and buttons are always shown as a fallback.
export function safeActionUrl(u){try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password&&!x.port?x.href:null}catch{return null}}
export const OPEN_WORDS=/打开|调出|调取|弹出|跳转|给我看|展示|显示|新窗口|浏览器/;
export const PACK_HINT='首次使用语音唤醒要下载本机语音包：点下方“开启聆听”即可自动下载（只需一次，约半分钟）。也可以直接文字提问。';
// Emotion labels returned by the speech model; only these are forwarded, and only for voice questions.
const VOICE_EMOTIONS=['neutral','happy','sad','angry','surprised','fearful','disgusted'];
import {createResponsePreferences} from './agent-response-preferences.mjs?v=20260924-1';
import {captureUtterance} from './agent-utterance.mjs?v=20260924-2';
import {playWithDeadline} from './agent-audio.mjs?v=20260924-1';
import {prepareMicrophone} from './agent-microphone.mjs?v=20260923-1';
import {seoContextLabel,socialContextLabel} from './agent-seo-status.mjs?v=20260923-3';
import {createWakeConversation} from './agent-wake.mjs?v=20261001-onewake';
import {openCatalogViewer} from './agent-catalog-viewer.mjs?v=20261001-mat1';
import {createTimeline,priceChart} from './agent-timeline.mjs?v=20261001-chart1';
// Explicit 百炼 dialogue only. Never receives CRM context or local assistant history.
export function mountConversation(host,{invoke,getPersona,onMessage,onMode,onTranscript,isAllowed,onSelectPersona,onStatus,onMaterials,timelineRoot=null,materialRow=null,materialFile=null,crmAnswer=null}){
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
 const bar=el('div','');bar.className='agent-conversation-tools';
 const mode=el('select','');mode.setAttribute('aria-label','回答方式');for(const [v,t] of [['local','CRM资料分析'],['bailian','智能推理']]){const o=el('option',t);o.value=v;mode.append(o)}
 const wakeButton=el('button','开启 Hello 唤醒'),installWake=el('button','安装本机语音包');
 const mic=el('button','开始语音'),stop=el('button','停止'),replay=el('button','播放回答'),check=el('button','检查连接'),status=el('span','可进行知识问答、业务分析和语音对话。');
 for(const b of [wakeButton,installWake,mic,stop,replay,check])b.type='button';status.setAttribute('role','status');
 const note=el('p','智能推理仅发送你主动输入的非机密问题、该模式近期对话、公开资料、背调样本分布、近30天权限内脱敏统计，以及已批准的SEO与社媒只读摘要；Hello唤醒前录音不上传；唤醒后说话片段发送至阿里云语音服务转写；切换浏览器标签页继续，播报期间暂停录音，停止或退出私人空间即结束。请勿输入客户机密或凭证。声音由AI生成；语音回答优先播报简短结果，完整信息显示在窗口。');note.className='hint';
 stop.setAttribute('data-voice-stop','true');const startWake=el('button','恢复聆听');startWake.type='button';startWake.setAttribute('data-voice-start','true');startWake.hidden=true;bar.append(startWake);bar.append(mode,installWake,wakeButton,mic,stop,replay,check,status,note);host.prepend(bar);
 // Voiceprint (owner approved 2026-09-28): the template is stored only on the internal material server.
 const enroll=el('button','注册声纹'),forget=el('button','删除声纹');enroll.type=forget.type='button';enroll.title='录一段 8 秒左右的话，共 3 段；只保存声纹特征数字，不保存录音';
 const vpNote=el('span','');vpNote.className='hint';bar.append(enroll,forget,vpNote);let forgetArmed=null;
 async function recordClip(ms){const s=await navigator.mediaDevices.getUserMedia({audio:true});try{const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('此浏览器没有受支持的录音格式');const r=new MediaRecorder(s,{mimeType:mime}),chunks=[];r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const done=new Promise(res=>r.onstop=res);r.start(500);await new Promise(res=>setTimeout(res,ms));r.stop();await done;return {blob:new Blob(chunks,{type:mime}),mime}}finally{s.getTracks().forEach(t=>t.stop())}}
 async function voiceprint(op,clip){const form=new FormData();form.append('action','voiceprint');form.append('persona',getPersona());form.append('op',op);if(clip)form.append('audio',clip.blob,'voiceprint.'+(clip.mime.includes('ogg')?'ogg':'webm'));return call(form)}
 enroll.onclick=async()=>{if(busy||recorder)return;stopAll();busy=true;enroll.disabled=true;try{state('请用正常语速说一段话（约 8 秒），例如介绍今天的工作…','listening');const clip=await recordClip(8000);state('正在登记声纹…','thinking');const r=await voiceprint('enroll',clip);vpNote.textContent=r.message||'';onMessage('assistant',r.message||'声纹操作已完成。');state('声纹：'+(r.status==='ok'?'已记录':'未完成'))}catch(e){state(e.name==='NotAllowedError'?'麦克风未授权':e.message)}finally{busy=false;enroll.disabled=false;sync()}};
 forget.onclick=async()=>{if(!forgetArmed){forget.textContent='确认删除声纹';forgetArmed=setTimeout(()=>{forgetArmed=null;forget.textContent='删除声纹'},6000);return}clearTimeout(forgetArmed);forgetArmed=null;forget.textContent='删除声纹';try{const r=await voiceprint('delete');vpNote.textContent=r.message||'';onMessage('assistant',r.message||'已删除。')}catch(e){state(e.message)}};
 const reveal=el('button','查看详细回答');reveal.type='button';reveal.hidden=true;bar.append(reveal);let pending=null;function showPending(){if(!pending)return false;const fn=pending;pending=null;reveal.hidden=true;fn();return true}reveal.onclick=showPending;
 let wake=null,wakeTransition=false,installing=false;const greetings=new Map(),greetingLoads=new Map();
 let preferenceStorage;try{preferenceStorage=window.localStorage}catch{preferenceStorage={getItem:()=>null,setItem:()=>{throw Error('unavailable')},removeItem:()=>{throw Error('unavailable')}}}
 const preferenceStores=new Map();const preferences=()=>{const persona=getPersona();if(!preferenceStores.has(persona))preferenceStores.set(persona,createResponsePreferences(preferenceStorage,'wonly-agent-preferences-chloe-v1-'+persona));return preferenceStores.get(persona)};
 const feedback=el('div','');feedback.className='agent-response-feedback';feedback.hidden=true;feedback.style.cssText='padding:12px;border:1px solid #475569;border-radius:12px;margin:12px 0;color:#e2e8f0;background:#111827';const feedbackLabel=el('p','回答改进 · 仅保存本机表达偏好，不保存资料正文');feedback.append(feedbackLabel);
 const feedbackButtons=[];for(const [code,label] of [['concise','更简洁'],['evidence','加强依据'],['actions','明确下一步']]){const b=el('button',label);b.type='button';b.dataset.preference=code;b.onclick=()=>{const store=preferences(),enabled=!store.get().includes(code),saved=store.set(code,enabled);renderFeedback();feedbackLabel.textContent=(saved?'已保存本机偏好':'仅本次会话生效')+'，下次推理回答将使用；资料原文不会被改写。'};feedbackButtons.push(b);feedback.append(b)}
 const resetPreferences=el('button','清除回答偏好');resetPreferences.type='button';resetPreferences.onclick=()=>{const saved=preferences().clear();renderFeedback();feedbackLabel.textContent=saved?'已清除本机回答偏好':'本次会话已清除；浏览器存储不可用，无法确认持久记录删除。'};feedback.append(resetPreferences);
 // Answer rating (owner, 2026-09-28): "没用" keeps this question and answer in a private CRM table so weak spots can be fixed.
 let lastAnswer=null;const rate=el('div','');rate.className='agent-answer-rating';const rateLabel=el('span','这条回答：');const up=el('button','有用'),down=el('button','没用');up.type=down.type='button';
 const reasons=el('div','');reasons.hidden=true;const rateNote=el('input','');rateNote.maxLength=200;rateNote.placeholder='补充说明（可选，不要写联系方式）';rateNote.setAttribute('aria-label','反馈补充说明');
 const REASONS=[['wrong_data','数据不对'],['off_topic','没答到点上'],['too_long','太长'],['too_vague','太空泛'],['tone','语气不对'],['other','其他']];
 async function sendRating(rating,reason=null){if(!lastAnswer)return;const body={action:'feedback',persona:lastAnswer.persona,rating,reason,route:lastAnswer.route,model:lastAnswer.model,...(rating==='down'?{question:lastAnswer.question,answer:lastAnswer.answer,note:rateNote.value.trim()||null}:{})};try{await call(body);rateLabel.textContent=rating==='up'?'已记下：有用。':'已记下，这题会进入改进清单（问题和回答只存在 CRM 内部）。';up.disabled=down.disabled=true;reasons.hidden=true;lastAnswer=null}catch(e){rateLabel.textContent='反馈未保存：'+e.message}}
 up.onclick=()=>sendRating('up');down.onclick=()=>{reasons.hidden=false;rateLabel.textContent='哪里不好？'};
 for(const [code,label] of REASONS){const b=el('button',label);b.type='button';b.onclick=()=>sendRating('down',code);reasons.append(b)}reasons.append(rateNote);rate.append(rateLabel,up,down,reasons);feedback.prepend(rate);
 function armRating(entry){lastAnswer=entry;rateLabel.textContent='这条回答：';up.disabled=down.disabled=false;reasons.hidden=true;rateNote.value=''}
 host.querySelector('#ai-assistant-messages')?.after(feedback);
 // Charts (e.g. competitor price bands) are shown right under the answer, with their official sources.
 function showCharts(actions){
  const msgs=host.querySelector('#ai-assistant-messages');if(!msgs||!Array.isArray(actions))return;
  for(const a of actions)if(a?.type==='price_chart'&&a.chart){const target=msgs.lastElementChild?.querySelector?.('.question-window-body')||msgs;target.append(priceChart(a.chart,document))}
 }
 // Without a timeline (the small AI panel), action windows render inside the conversation; links open only on click.
 function runActions(actions){
  const box=el('div','');box.className='agent-actions';box.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:8px 0';
  for(const a of actions.slice(0,6)){
   if(a?.type==='catalog_view'&&/^c[1-4]$/.test(a.catalog||'')){const b=el('button','看画册 · '+String(a.label||'画册').slice(0,60));b.type='button';b.className='button secondary';b.onclick=async()=>{try{const d=await call({action:'catalog-pages',persona:getPersona(),catalog:a.catalog});openCatalogViewer({title:String(d?.title||a.label),urls:d?.urls||[],pdf:d?.pdf||null,start:a.page||1,container:host.querySelector('#ai-assistant-messages')})}catch(e){onMessage('assistant',e.message)}};box.append(b);continue}
   const url=safeActionUrl(a?.url);if(!url)continue;const link=el('a','打开 · '+String(a.label||url).slice(0,60));link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.className='button secondary';box.append(link)}
  if(box.children.length)host.querySelector('#ai-assistant-messages')?.append(box);
 }
 function renderFeedback(){for(const b of feedbackButtons)b.setAttribute('aria-pressed',String(preferences().get().includes(b.dataset.preference)))}
 const timeline=timelineRoot?createTimeline(timelineRoot,{call,getPersona,materialRow,materialFile}):null;
 const histories=new Map(),materialHistories=new Map();let ready=false,busy=false,version=0,recorder=null,stream=null,timer=null,player=null,audioUrl=null,lastTicket=null,lastGreeting=null,controller=null;
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
 async function greeting(persona,kind='wake'){const cacheKey=persona+':'+kind;if(greetings.has(cacheKey))return greetings.get(cacheKey);if(!greetingLoads.has(cacheKey))greetingLoads.set(cacheKey,call({action:'greeting',persona,kind}).then(blob=>{greetings.set(cacheKey,blob);return blob}).finally(()=>greetingLoads.delete(cacheKey)));return greetingLoads.get(cacheKey)}
 async function checkConnection(){const epoch=version;check.disabled=true;try{const s=await call({action:'status'});if(epoch!==version)return;ready=!!s.enabled&&!!s.configured;state(!s.configured?'尚未配置百炼密钥':!s.enabled?'数据范围等待批准启用':'连接已就绪')}catch(e){if(epoch===version){ready=false;state(e.message)}}finally{check.disabled=false;sync()}}
 async function playBlob(blob,epoch){
  if(version!==epoch)throw Error('对话已停止');audioUrl=URL.createObjectURL(blob);player=new Audio(audioUrl);
  const current=player,url=audioUrl;
  try{await playWithDeadline(current,controller?.signal,{onPlaying:()=>{if(version===epoch){busy=false;state('正在说话 · 可点击停止','speaking')}}})}
  finally{URL.revokeObjectURL(url);if(version===epoch){player=null;audioUrl=null;busy=false}}
  if(version===epoch)state(voice?'':'播报结束');
 }
 async function speak(ticket,epoch,persona){
  if(!ticket||version!==epoch)return;controller=new AbortController();busy=true;state('','thinking');
  try{const blob=await call({action:'speech',persona,ticket},controller.signal);await playBlob(blob,epoch)}catch(e){if(version===epoch){busy=false;state(e.message)}if(wake?.isActive())throw e}
 }
 async function ask(question,{voice=false,emotion=null,voiceProof=null}={}){
  if(mode.value!=='bailian')return false;
  if(!ready){state('请先完成百炼配置并检查连接');return true}
  if(busy||recorder||player)return true;
  if(pending&&/^(?:好的?|可以|需要|打开|看看|看数据|看数据看板|查看详细回答|展开方案)[。！!\s]*$/.test(question.trim())){onMessage('user',question);showPending();return true}
  pending=null;reveal.hidden=true;
  stopAll({keepWake:voice});const epoch=version,persona=getPersona();controller=new AbortController();busy=true;lastTicket=null;state(voice?'':'收到，正在整理回答…','thinking');const progress=setTimeout(()=>{if(version===epoch&&busy)state('仍在处理你的问题，完成后会立即显示；你可以随时停止','thinking')},4500);onMessage('user',question);onTranscript('');
  // Owner 2026-09-28: every request becomes a step in the Grace timeline; nothing opens a new browser window.
  const entry=timeline?.begin(question)||null;
  // Owner 2026-10-01: CRM number/list questions are answered from the live CRM data in this browser (never sent out).
  let live=null;try{live=crmAnswer?.(question)||null}catch{live=null}
  if(live){try{onMessage('assistant',live.answer);entry?.done({provider:'local',context:{route:'crm_live',labels:live.labels},actions:live.windows});busy=false;state(voice?'':'回答完成');
    if(voice&&version===epoch){try{const t=await call({action:'local-ticket',persona,kind:'crm_data'});await speak(t.ticket,epoch,persona)}catch{}}}
   finally{clearTimeout(progress);if(version===epoch){busy=false;sync()}}return true}
  try{const pendingCall=call({action:'chat',persona,question,voice,...(voice&&VOICE_EMOTIONS.includes(emotion)?{voiceEmotion:emotion}:{}),...(voice&&voiceProof?.data&&voiceProof?.signature?{voiceProof}:{}),preferences:preferences().get(),materialHistory:materialHistories.get(persona)||[],history:fitHistory(histories.get(persona)||[])},controller.signal);
   // Like a person: only say "let me look" when the answer is not ready within 1.5 s.
   if(voice){const quick=await Promise.race([pendingCall.then(()=>true,()=>true),new Promise(r=>setTimeout(()=>r(false),1500))]);if(!quick&&version===epoch){try{await playBlob(await greeting(persona,'ack'),epoch)}catch(e){if(version!==epoch)return true}busy=true;state('','thinking')}}
   const result=await pendingCall;if(version!==epoch||persona!==getPersona()){entry?.fail('已停止或切换了智能体');return true}
   if(result.ignored){entry?.discard();busy=false;state('');return true}
   // Never leave an empty answer window: say what happened and let the person ask again.
   if(!String(result?.answer||'').trim()){const why=String(result?.error||'').replace(/百炼/g,'智能服务').slice(0,80);entry?.fail(why||'服务没有返回内容');busy=false;onMessage('assistant','这次没有生成回答'+(why?'（'+why+'）':'（服务没有返回内容）')+'，可以再问一次，或者换个说法。');state(voice?'':'回答未完成，可重试');return true}
   entry?.done(result);
   if(result.provider==='internal'){if(result.context?.material_question)materialHistories.set(persona,[result.context.material_question])}else materialHistories.delete(persona);
   if(result.provider!=='internal')histories.set(persona,[...(histories.get(persona)||[]),{role:'user',content:question},{role:'assistant',content:result.answer}].slice(-20));const publish=()=>{onMessage('assistant',result.answer+'\n\n'+(result.context?.route==='conversation'?'':result.context?.route==='materials'?' 物料库检索':result.context?.route==='general'?' 通用知识':result.context?.route==='research'?' 公开资料检索':'权限内业务资料'+seoContextLabel(result.context)+socialContextLabel(result.context)));if(!entry){if(Array.isArray(result.materials))onMaterials?.(result.materials);if(Array.isArray(result.actions)&&result.actions.length)runActions(result.actions)}showCharts(result.actions);feedback.hidden=false;renderFeedback();armRating({persona,question:String(question).slice(0,1000),answer:String(result.answer||'').slice(0,2000),route:String(result.context?.route||result.provider||'').slice(0,40),model:String(result.model||'').slice(0,60)});};lastTicket={ticket:result.ticket,persona};busy=false;state(voice?'':'回答完成');if(voice){let spoken=0;try{spoken=String(JSON.parse(result.ticket?.data||'{}').text||'').length}catch{}const hasMore=String(result.answer||'').length>spoken*1.6+60;if(hasMore){pending=publish;reveal.hidden=false}else publish();try{await speak(result.ticket,epoch,persona);if(version===epoch&&hasMore){await playBlob(await greeting(persona,'offer'),epoch);if(version!==epoch)return true;state('想看完整内容，点“查看详细回答”，或先说 Hello Grace 再说“打开”')}else if(version===epoch)state('')}catch(e){if(version===epoch){showPending();state('声音没播出来，文字回答已经显示；可以继续问')}}}else publish();
  }catch(e){entry?.fail(String(e?.message||'').replace(/百炼/g,'智能服务'));if(version===epoch){busy=false;onMessage('assistant','本次回答未完成：'+String(e.message).replace(/百炼/g,'智能服务')+'。请重试。');state('回答未完成，可重试');if(wake?.isActive())throw e}}finally{clearTimeout(progress);if(version===epoch){busy=false;sync()}}return true;
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
   current.onstop=async()=>{recorder=null;release();if(version!==epoch)return;busy=true;state('正在转写…','thinking');controller=new AbortController();try{const form=new FormData();form.append('persona',persona);form.append('audio',new Blob(chunks,{type:mime}),'speech.'+(mime.includes('ogg')?'ogg':'webm'));const data=await call(form,controller.signal);if(version!==epoch)return;if(data.ignored){busy=false;state(data.ignored==='unavailable'?'声纹服务暂时不可用，这段语音没有处理，可以用文字提问':'');return}if(!data.text?.trim())throw Error('没有识别到说话内容');onTranscript(data.text);busy=false;await ask(data.text,{voice:true,emotion:data.emotion,voiceProof:data.voiceProof})}catch(e){if(version===epoch){busy=false;state(e.message)}}};
   current.onerror=()=>{stopAll();state('录音失败，请重试')};current.start(1000);busy=false;state('正在聆听 · 最长60秒，点击“结束并提问”','listening');timer=setTimeout(()=>{if(current.state==='recording')current.stop()},60000);
  }catch(e){release();busy=false;state(e.name==='NotAllowedError'?'麦克风未授权，可继续文字提问':e.message)}
 }
 async function enter(){
  // Opening Grace's room is the user's explicit voice-start action.
  // Wake-triggered persona selection must not restart or cancel its own greeting.
  if(wakeTransition||getPersona()!=='Grace'||!isAllowed()||document.hidden)return;
  stopAll();const epoch=version;mode.value='bailian';ready=false;state('正在为 Grace 准备语音唤醒…');
  await checkConnection();if(epoch!==version||!ready||document.hidden)return;
  void greeting('Grace').catch(()=>{});void greeting('Grace','ack').catch(()=>{});void greeting('Grace','offer').catch(()=>{});installing=true;sync();
  try{if(await wake.needsDownload()){if(epoch===version)state(PACK_HINT);return}state('正在请求麦克风权限…');await prepareMicrophone(navigator.mediaDevices);if(epoch!==version||document.hidden)return;await wake.install();if(epoch!==version||document.hidden)return;await wake.start()}
  catch(e){if(epoch===version)state(/user gesture|downloadable/i.test(String(e.message))?'首次使用语音唤醒需要下载本机语音包：请点“语音与连接”里的“安装本机语音包”（只需一次）。现在也可以直接用文字提问。':e.message)}
  finally{if(epoch===version){installing=false;sync()}}
 }
 mode.onchange=()=>{stopAll();lastTicket=null;state(mode.value==='bailian'?'仅输入非机密内容；按开始语音可说话':'CRM资料仅在本地分析');if(mode.value==='bailian')checkConnection()};
 let lastVoiceMeta=null;
 async function readQuestion(signal){
  const epoch=version,persona=getPersona();
  const blob=await captureUtterance({signal,onState:state});
  if(signal.aborted||epoch!==version||!isAllowed())throw Error('对话已停止');
  if(!blob)return '';
  state('','thinking');
  const form=new FormData();form.append('persona',persona);form.append('audio',blob,'speech.'+(blob.type.includes('ogg')?'ogg':'webm'));
  const result=await call(form,signal);
  if(signal.aborted||epoch!==version)throw Error('对话已停止');
  lastVoiceMeta={emotion:result.emotion,voiceProof:result.voiceProof};
  return result.text?.trim()||'';
 }
 wake=createWakeConversation({readQuestion,Recognition:window.SpeechRecognition||window.webkitSpeechRecognition,onState:state,
  onWake:async persona=>{
   wakeTransition=true;try{onSelectPersona(persona)}finally{wakeTransition=false}
   if(getPersona()!==persona)throw Error('当前对话未结束，无法切换智能体');
   const epoch=version;controller=new AbortController();busy=true;lastTicket=null;lastGreeting=persona;state("I'm here, Chloe.",'speaking');onMessage('assistant',persona==='Grace'?"I'm here, Chloe.":'Hello Chloe');
   try{const blob=await greeting(persona);if(version!==epoch)return;state('','speaking');await playBlob(blob,epoch)}catch(e){if(version===epoch){busy=false;onMessage('assistant','已听到你的唤醒词，但问候声音未完成：'+e.message+'。可以继续说出问题。')}throw e}
  },onQuestion:text=>{const meta=lastVoiceMeta||{};lastVoiceMeta=null;return ask(text,{voice:true,emotion:meta.emotion,voiceProof:meta.voiceProof})}});
 installWake.onclick=async()=>{if(installing)return;stopAll();installing=true;sync();try{await wake.install()}catch(e){state(e.message)}finally{installing=false;sync()}};
 startWake.onclick=async()=>{if(wake.isActive())return;if(mode.value!=='bailian'||!ready){mode.value='bailian';await checkConnection()}if(ready)await wakeButton.onclick()};
 wakeButton.onclick=async()=>{if(wake.isActive()){stopAll();return}if(!ready)return;stopAll();const epoch=version;try{if(await wake.needsDownload()){installing=true;sync();try{await wake.install()}finally{installing=false;sync()}if(epoch!==version)return}state('正在请求麦克风权限…');await prepareMicrophone(navigator.mediaDevices);if(epoch!==version||document.hidden)return;await wake.start()}catch(e){state(e.message)}};
 mic.onclick=record;stop.onclick=()=>stopAll();check.onclick=checkConnection;replay.onclick=async()=>{if(lastTicket){stopAll();speak(lastTicket.ticket,version,lastTicket.persona)}else if(lastGreeting){const persona=lastGreeting;stopAll();const epoch=version;controller=new AbortController();busy=true;state('正在重播问候…','thinking');try{const blob=await greeting(persona);if(version!==epoch)return;await playBlob(blob,epoch)}catch(e){if(version===epoch)state(e.message)}finally{if(version===epoch){busy=false;sync()}}}};
 // An explicitly started conversation continues across browser tab switches.
 window.addEventListener('pagehide',stopAll);sync();
 return {ask,enter,loadTimeline:()=>timeline?.load(),beginTimeline:question=>timeline?.begin(question)||null,isModel:()=>mode.value==='bailian',busy:()=>busy||!!recorder,reset(){pending=null;reveal.hidden=true;feedback.hidden=true;stopAll({keepWake:wakeTransition});lastTicket=null;lastGreeting=null;sync()},clear(){pending=null;reveal.hidden=true;histories.delete(getPersona());materialHistories.delete(getPersona());stopAll();lastTicket=null;lastGreeting=null;sync()}};
}
