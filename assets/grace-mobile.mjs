import {progressBlock} from './agent-material-progress.mjs';
export const isGraceApp=()=>location.pathname==='/grace.html'||new URLSearchParams(location.search).get('app')==='grace';
export function orbState(mode,online=true){return !online?'offline':({idle:'idle',listening:'listen',thinking:'think',speaking:'speak',interrupt:'interrupt',offline:'offline'}[mode]||'idle')}
// Presentation only: all questions, permissions, materials and history remain in
// the existing Grace controller. This module has no network client or API keys.
export function mountGraceMobile({host,model,onLogout,readProgress}){
 document.documentElement.dataset.graceApp='true';
 const app=document.createElement('section');app.id='grace-mobile';app.dataset.view='home';
 app.innerHTML=`<div class="grace-scroll"><header class="grace-top"><span>grace<span class="grace-dot">●</span></span><button type="button" data-tab="settings" aria-label="设置">•••</button></header><div class="grace-call-extra" hidden><button type="button" class="grace-call-interrupt">打断并继续说</button><button type="button" class="grace-call-mute">静音</button><button type="button" class="grace-call-end">挂断</button><span class="grace-call-clock"></span></div>
 <section class="grace-home"><div class="grace-orb idle" role="img" aria-label="Grace 待机"><div class="scene"><div class="ring"></div><div class="ripple"></div><div class="ripple second"></div><div class="body"></div><div class="face"><i class="eye"></i><i class="eye"></i></div></div></div><h1>我在，你说。</h1><p id="grace-status" role="status">正在连接 Grace…</p><button class="grace-voice" type="button">开始语音</button><button class="grace-stop" type="button">停止回答 / 录音</button></section>
 <section class="grace-sheet"><div class="grace-sheet-title"><h2>记录与资料</h2></div><div class="grace-prompts"><button type="button" data-question="我们有哪些产品系列？">了解产品 <span>↗</span></button><button type="button" data-question="总结当前营销情况">看看业务 <span>↗</span></button></div><section class="grace-progress" aria-label="产品资料解析进度"><div class="grace-progress-body"></div><button type="button" class="grace-progress-refresh">刷新进度</button></section><div class="grace-chat-status"><span role="status">连接中…</span><button type="button" class="grace-chat-stop">停止</button></div><div class="grace-chat"></div><div class="grace-history"></div><div class="grace-settings"><h2>语音与连接</h2><p>沿用网页版账号、知识来源与数据权限。</p><div class="grace-tools"></div><button type="button" class="grace-reconnect">重新连接</button><button type="button" class="grace-logout">退出账号</button></div></section></div><div class="grace-composer"></div>
 <nav class="grace-nav" aria-label="主导航"><button type="button" data-tab="home">陪伴</button><button type="button" data-tab="chat">对话</button><button type="button" data-tab="history">资料</button></nav>`;
 host.append(app);
 const panel=document.querySelector('#ai-assistant-panel'),form=document.querySelector('#ai-assistant-form'),tools=panel.querySelector('.agent-conversation-tools');
 app.querySelector('.grace-chat').append(panel);panel.classList.remove('hidden');
 app.querySelector('.grace-composer').append(form);app.querySelector('.grace-tools').append(tools);
 const timeline=document.querySelector('#room-timeline');if(timeline)app.querySelector('.grace-history').append(timeline);
 let callState={active:false},mode='idle',interruptTimer,progressBusy=false;
 async function updateProgress(){if(progressBusy||document.hidden||!app.isConnected)return;progressBusy=true;const button=app.querySelector('.grace-progress-refresh');button.disabled=true;button.textContent='正在查询…';try{const p=await readProgress?.();app.querySelector('.grace-progress-body').replaceChildren(progressBlock(p||{status:'unavailable'}))}catch{app.querySelector('.grace-progress-body').replaceChildren(progressBlock({status:'unavailable'}))}finally{progressBusy=false;button.disabled=false;button.textContent='刷新进度'}}
 app.querySelector('.grace-progress-refresh').onclick=updateProgress;
 app.querySelector('.grace-progress-body').append(progressBlock(null));
 const progressTimer=setInterval(()=>{if(!app.isConnected){clearInterval(progressTimer);return}if(app.dataset.view==='history')void updateProgress()},300000);

 const stateLabels={idle:'待机',listen:'聆听',think:'思考',speak:'回答',interrupt:'已停止',offline:'未连接'};
 function paint(){app.dataset.mode=mode;const state=orbState(mode,navigator.onLine);const orb=app.querySelector('.grace-orb');orb.className='grace-orb '+state;orb.setAttribute('aria-label','Grace '+stateLabels[state]);app.querySelector('.grace-stop').hidden=callState.active||!['listening','thinking','speaking'].includes(mode);app.querySelector('.grace-chat-stop').hidden=callState.active||!['listening','thinking','speaking'].includes(mode);app.querySelector('.grace-voice').hidden=!callState.active&&['thinking','speaking'].includes(mode);app.querySelector('.grace-voice').textContent=callState.active?'挂断通话':'开始通话';app.querySelector('.grace-voice').disabled=!navigator.onLine}
 function tab(view){app.dataset.view=view;app.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===view)));if(view==='history'){model.loadTimeline();void updateProgress()}}
 app.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
 app.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{document.querySelector('#ai-assistant-input').value=b.dataset.question;form.requestSubmit()});
 form.addEventListener('submit',()=>{const input=document.querySelector('#ai-assistant-input');if(input.value.trim())tab('chat');else if(!model.busy()){for(const node of app.querySelectorAll('#grace-status,.grace-chat-status span'))node.textContent='请先输入你想问的问题';input.focus()}},true);
 app.querySelector('.grace-voice').onclick=()=>tools.querySelector('[data-phone-toggle]')?.click();
 app.querySelector('.grace-call-end').onclick=()=>model.phone.stop();
 app.querySelector('.grace-call-interrupt').onclick=()=>model.phone.interrupt();app.querySelector('.grace-call-mute').onclick=()=>model.phone.setMuted(!model.phone.snapshot().muted);
 app.addEventListener('grace-call-state',e=>{const s=e.detail;callState=s;app.querySelector('.grace-call-extra').hidden=!s.active;app.querySelector('.grace-call-interrupt').disabled=s.muted||s.phase==='connecting';app.querySelector('.grace-call-mute').disabled=s.phase==='connecting';app.querySelector('.grace-call-mute').textContent=s.muted?'取消静音':'静音';app.querySelector('.grace-call-clock').textContent=String(Math.floor(s.elapsedMs/60000)).padStart(2,'0')+':'+String(Math.floor(s.elapsedMs/1000)%60).padStart(2,'0');paint()});
 app.querySelector('.grace-chat-stop').onclick=app.querySelector('.grace-stop').onclick=()=>{model.stop();mode='interrupt';paint();clearTimeout(interruptTimer);interruptTimer=setTimeout(()=>{mode='idle';paint()},900)};
 app.querySelector('.grace-reconnect').onclick=()=>model.checkConnection();app.querySelector('.grace-logout').onclick=()=>{model.stop();onLogout()};
 addEventListener('offline',()=>{model.stop();app.querySelector('#grace-status').textContent='网络已断开，请联网后重试';paint()});
 addEventListener('online',()=>{paint();void model.checkConnection()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)model.stop()});
 const viewport=window.visualViewport;const fitKeyboard=()=>{const height=viewport?.height||innerHeight;app.style.setProperty('--grace-viewport-height',`${height}px`);app.style.setProperty('--grace-viewport-top',`${viewport?.offsetTop||0}px`);app.classList.toggle('keyboard-open',!!viewport&&innerHeight-height>120)};viewport?.addEventListener('resize',fitKeyboard);viewport?.addEventListener('scroll',fitKeyboard);addEventListener('resize',fitKeyboard);fitKeyboard();
 tab('home');paint();
 return {showConversation(){if(!callState.active)tab('chat')},setStatus(text){for(const node of app.querySelectorAll('#grace-status,.grace-chat-status span'))node.textContent=text||stateLabels[orbState(mode)];},setMode(value){clearTimeout(interruptTimer);mode=value;paint()}};
}
