export function wakeName(text){const m=String(text).trim().match(/^hello[\s,，]+(grace|brian|jay)[.!！。?？\s]*$/i);return m?{grace:'Grace',brian:'Brian',jay:'Jay'}[m[1].toLowerCase()]:null}
export function endPhrase(text){return /^(结束对话|停止对话|退出语音|goodbye)[。.!！?？\s]*$/i.test(String(text).trim())}
// Requires genuine browser on-device recognition; never falls back to cloud SR.
export function createWakeConversation({Recognition,onState,onWake,onQuestion,readQuestion}){
 let generation=0,recognition=null,active=false,phase='wake',expiry=null,restart=null,dialogueController=null;const repaired=new Set();
 function stop(){dialogueController?.abort();dialogueController=null;generation++;active=false;clearTimeout(expiry);clearTimeout(restart);if(recognition){recognition.onend=null;recognition.onresult=null;recognition.onerror=null;recognition.abort();recognition=null}}
 function supported(){if(!Recognition||!('processLocally' in Recognition.prototype)||typeof Recognition.available!=='function')throw Error('此浏览器不支持本机唤醒，请使用“开始语音”与百炼对话');}
 async function packs(){supported();return Promise.all((readQuestion?['en-US']:['en-US','zh-CN']).map(async lang=>({lang,status:await Recognition.available({langs:[lang],processLocally:true})})));}
 function unavailable(items){const missing=items.filter(x=>x.status==='unavailable').map(x=>x.lang==='en-US'?'英文':'中文');return missing.length?'此浏览器不支持'+missing.join('和')+'本机语音包；请使用“开始语音”与百炼对话':null}
 async function install(){
  stop();const g=generation;onState('正在检查本机语音包…');const items=await packs();if(g!==generation)return;
  const issue=unavailable(items);if(issue)throw Error(issue);
  const missing=items.filter(x=>x.status!=='available');
  if(missing.length){if(typeof Recognition.install!=='function')throw Error('此浏览器无法安装本机语音包，请使用“开始语音”');onState('正在下载本机语音包，完成后再点击“开启 Hello 唤醒”…');
   const installed=await Recognition.install({langs:missing.map(x=>x.lang),processLocally:true});if(g!==generation)return;if(!installed)throw Error('语音包下载未完成，请重试或使用“开始语音”');
  }
  const checked=await packs();if(g!==generation)return;if(checked.some(x=>x.status!=='available'))throw Error('语音包仍在准备，请稍后重试');onState('本机语音包已就绪，请点击“开启 Hello 唤醒”，再说 Hello Grace');
 }
 async function start(){
  repaired.clear();stop();const g=generation;const items=await packs();if(g!==generation)return;
  const issue=unavailable(items);if(issue)throw Error(issue);
  if(items.some(x=>x.status!=='available'))throw Error('尚未开始监听：请先点击“安装本机语音包”，完成后再开启 Hello 唤醒');
  active=true;phase='wake';listen(g);
 }
 async function dialogue(g){
  const control=new AbortController();dialogueController=control;
  try{
   const text=await readQuestion(control.signal);
   if(!active||g!==generation)return;
   if(endPhrase(text)){stop();onState('对话已结束');return}
   if(text?.trim())await onQuestion(text);
   if(active&&g===generation)restart=setTimeout(()=>listen(g),250);
  }catch(error){if(active&&g===generation){stop();onState((error.message||'语音连接失败')+'；聆听已停止，请点击开启聆听重试')}}
 }
 function listen(g){
  if(!active||g!==generation)return;
  if(phase==='dialogue'&&readQuestion){void dialogue(g);return}
  const r=new Recognition();recognition=r;r.processLocally=true;r.lang=phase==='wake'?'en-US':'zh-CN';r.continuous=false;r.interimResults=false;let handled=false;
  onState('正在启动本机识别…');r.onstart=()=>{if(active&&g===generation)onState(phase==='wake'?'正在聆听唤醒词：Hello Grace / Brian / Jay':'正在聆听你的问题；说“结束对话”退出','listening')};
  r.onresult=async e=>{
   if(handled||!active||g!==generation)return;
   const text=Array.from(e.results).filter(x=>x.isFinal).map(x=>x[0].transcript).join(' ').trim();if(!text)return;
   const persona=wakeName(text);if(phase==='wake'&&!persona){onState('本机识别：'+text.slice(0,70)+'；请单独说 Hello Grace','listening');return;}
   handled=true;r.onend=null;r.abort();recognition=null;
   if(endPhrase(text)){stop();onState('对话已结束');return}
   try{
    // Recognition is stopped while greeting/answer audio plays to avoid echo loops.
    if(persona){await onWake(persona);phase='dialogue'}else await onQuestion(text);
    if(active&&g===generation)listen(g);
   }catch(error){if(active&&g===generation){phase='dialogue';onState((error.message||'本次回答未完成')+'；继续聆听，可重新提问');restart=setTimeout(()=>listen(g),1200)}}
  };
  r.onerror=async e=>{if(g!==generation)return;
   if(e.error==='language-not-supported'){
    const lang=r.lang,label=lang==='en-US'?'英文唤醒':'中文对话';handled=true;r.onend=null;r.abort();recognition=null;
    if(repaired.has(lang)||typeof Recognition.install!=='function'){stop();onState(label+'的本机引擎无法启动（'+lang+'）。请使用“开始语音”；没有切换到云端常驻监听。');return}
    repaired.add(lang);onState('正在修复'+label+'语言包（'+lang+'）…');
    try{const ok=await Recognition.install({langs:[lang],processLocally:true});if(g!==generation||!active)return;
     const status=await Recognition.available({langs:[lang],processLocally:true});if(g!==generation||!active)return;
     if(!ok||status!=='available')throw Error(label+'语言包未能准备好');
     listen(g);
    }catch(error){if(g===generation){stop();onState((error.message||label+'修复失败')+'；可使用“开始语音”')}}return;
   }
if(e.error==='no-speech'){onState('暂未听清声音，请靠近麦克风说 Hello Grace','listening');return}if(e.error==='aborted')return;stop();onState(e.error==='not-allowed'?'本机唤醒被浏览器拒绝；即使麦克风已允许，语音识别仍可能受限。可用“开始语音”录音对话。':'本机语音识别失败：'+e.error+'；可使用按钮录音')};
  r.onend=()=>{recognition=null;if(!handled&&active&&g===generation)restart=setTimeout(()=>listen(g),350)};
  try{r.start()}catch(error){stop();onState(error.message||'无法开启本机语音识别')}
 }
 return {start,stop,install,isActive:()=>active};
}
