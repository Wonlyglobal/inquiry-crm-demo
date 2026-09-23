export function wakeName(text){const m=String(text).trim().match(/^hello[\s,，]+(grace|brian|jay)[.!！。?？\s]*$/i);return m?{grace:'Grace',brian:'Brian',jay:'Jay'}[m[1].toLowerCase()]:null}
export function endPhrase(text){return /^(结束对话|停止对话|退出语音|goodbye)[。.!！?？\s]*$/i.test(String(text).trim())}
// Requires genuine browser on-device recognition; never falls back to cloud SR.
export function createWakeConversation({Recognition,onState,onWake,onQuestion}){
 let generation=0,recognition=null,active=false,phase='wake',expiry=null,restart=null;
 function stop(){generation++;active=false;clearTimeout(expiry);clearTimeout(restart);if(recognition){recognition.onend=null;recognition.onresult=null;recognition.onerror=null;recognition.abort();recognition=null}}
 async function start(){
  stop();const g=generation;
  if(!Recognition||!('processLocally' in Recognition.prototype)||typeof Recognition.available!=='function')throw Error('此浏览器不支持本机唤醒，请使用“开始语音”');
  const available=await Recognition.available({langs:['en-US','zh-CN'],processLocally:true});
  if(g!==generation)return;
  if(available!=='available')throw Error('本机中英文语音包未就绪，需在浏览器安装后再开启唤醒');
  active=true;phase='wake';expiry=setTimeout(()=>{stop();onState('语音已在10分钟后自动关闭')},600000);listen(g);
 }
 function listen(g){
  if(!active||g!==generation)return;
  const r=new Recognition();recognition=r;r.processLocally=true;r.lang=phase==='wake'?'en-US':'zh-CN';r.continuous=false;r.interimResults=false;let handled=false;
  onState(phase==='wake'?'本机待唤醒：Hello Grace / Brian / Jay':'正在聆听；说“结束对话”退出','listening');
  r.onresult=async e=>{
   if(handled||!active||g!==generation)return;
   const text=Array.from(e.results).filter(x=>x.isFinal).map(x=>x[0].transcript).join(' ').trim();if(!text)return;
   const persona=wakeName(text);if(phase==='wake'&&!persona)return;
   handled=true;r.onend=null;r.abort();recognition=null;
   if(endPhrase(text)){stop();onState('对话已结束');return}
   try{
    // Recognition is stopped while greeting/answer audio plays to avoid echo loops.
    if(persona){await onWake(persona);phase='dialogue'}else await onQuestion(text);
    if(active&&g===generation)listen(g);
   }catch(error){if(g===generation){stop();onState(error.message||'语音对话未完成，请重试')}}
  };
  r.onerror=e=>{if(g!==generation)return;if(['no-speech','aborted'].includes(e.error))return;stop();onState('本机语音识别失败：'+e.error+'；可使用按钮录音')};
  r.onend=()=>{recognition=null;if(!handled&&active&&g===generation)restart=setTimeout(()=>listen(g),350)};
  try{r.start()}catch(error){stop();onState(error.message||'无法开启本机语音识别')}
 }
 return {start,stop,isActive:()=>active};
}
