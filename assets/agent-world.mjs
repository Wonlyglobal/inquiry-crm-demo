import {loadHologram,createHologram,drawPedestal,drawRoomHud,createRain,speechLevel} from './agent-hologram.mjs?v=hologram-20261001';
export function canUseAgentWorld(profile,user){
 return Boolean(profile?.active && profile.role==='owner' && profile.id==='c43bd3c2-6e3a-4228-99c7-dc95f33643f2' && user?.id===profile.id && String(user?.email||'').toLowerCase()==='chloelee@wonlyglobal.com');
}
export function mountAgentWorld(host,{onSelect,onAnalysis,onLeave,isAllowed,getLive}){
 if(!isAllowed())throw new Error('当前账号无权进入智能体世界');
 host.innerHTML="<div id=\"agent-world\"><main class=\"aw-main\"><div class=\"welcome\"><div class=\"eyebrow\">WELCOME TO YOUR AGENT WORLD</div><h1>欢迎进入王力CRM系统</h1><p>让每一个经营问题，都找到合适的智能体。</p></div><section id=\"agents-view\" aria-label=\"智能体世界\"><div class=\"constellation\">\n<article class=\"advisor\" style=\"--tone:#edc476\"><button class=\"open-orb\" data-advisor=\"Grace\" aria-label=\"与 Grace 营销增长智能体对话\"><canvas data-role=\"1\" aria-label=\"Grace 琥珀金动态脑核\"></canvas><canvas class=\"aw-hud\" aria-hidden=\"true\"></canvas></button><h2>Grace</h2><div class=\"job\">营销增长智能体</div><p class=\"desc\">洞察渠道与线索，让增长方向更清晰。</p><button class=\"enter\" data-advisor=\"Grace\">进入 Grace</button></article>\n<article class=\"advisor\" style=\"--tone:#bca1f3\"><button class=\"open-orb\" data-advisor=\"Jay\" aria-label=\"与 Jay 经营决策智能体对话\"><canvas data-role=\"0\" aria-label=\"Jay 紫罗兰动态脑核\"></canvas><canvas class=\"aw-hud\" aria-hidden=\"true\"></canvas></button><h2>Jay</h2><div class=\"job\">经营决策智能体</div><p class=\"desc\">汇总营销与销售洞察，辅助经营决策。</p><button class=\"enter\" data-advisor=\"Jay\">进入 Jay</button></article>\n<article class=\"advisor\" style=\"--tone:#7bd5f7\"><button class=\"open-orb\" data-advisor=\"Brian\" aria-label=\"与 Brian 销售智能体对话\"><canvas data-role=\"2\" aria-label=\"Brian 冰蓝动态脑核\"></canvas><canvas class=\"aw-hud\" aria-hidden=\"true\"></canvas></button><h2>Brian</h2><div class=\"job\">销售智能体</div><p class=\"desc\">梳理客户进展，让下一步跟进更明确。</p><button class=\"enter\" data-advisor=\"Brian\">进入 Brian</button></article>\n</div><div class=\"coord\">Grace 营销洞察 → Jay 经营统筹 ← Brian 销售进展</div><div class=\"command\"><span aria-hidden=\"true\">✧</span><div><p>今天，你想先解决什么问题？</p><small>选择一位智能体，开始对话</small></div></div></section>\n<div class=\"world-live-note\">本地分析沿用看板周期；模型使用近30天权限内脱敏统计。进入私人空间后可检查模型与语音连接。</div><div id=\"world-knowledge-slot\"></div><div id=\"world-selection\" class=\"world-section-title\" aria-live=\"polite\">请选择一位智能体</div><div id=\"world-chat-slot\"></div><button type=\"button\" id=\"world-show-analysis\" class=\"world-analysis-toggle\" hidden>查看当前智能体的证据与建议</button><div id=\"world-analysis-slot\"></div></main></div>";
 const room=document.createElement('section');room.id='agent-private-room';room.hidden=true;room.setAttribute('aria-label','智能体私人空间');
 room.innerHTML=`<button type="button" id="room-back">← 返回智能体世界</button><div class="room-layout"><div class="room-left"><section id="room-live" class="room-live" aria-label="实时看板"></section><aside id="room-timeline" aria-label="需求时间线"></aside></div><div class="room-heading"><div class="room-orb"><canvas class="aw-rain" aria-hidden="true"></canvas><canvas data-role="0" aria-label="当前智能体"></canvas><canvas class="aw-hud" aria-hidden="true"></canvas></div><h1 id="room-title" tabindex="-1"></h1><p id="room-purpose"></p><p id="room-voice-status" role="status">等待你的指令</p></div><aside id="room-content" aria-label="信息窗口"><header class="room-window-head"><span>对话与资料</span><button type="button" id="room-window-close" aria-label="收起信息窗口">×</button></header></aside></div><nav class="room-dock" aria-label="私人空间操作"><button type="button" id="room-text" aria-expanded="false">文字提问</button><button type="button" id="room-results" aria-expanded="false">信息窗口</button><button type="button" id="room-settings">语音与连接</button><button type="button" id="room-start">开启聆听</button><button type="button" id="room-stop">停止聆听</button></nav><div id="room-compose" hidden></div>`;
 const main=host.querySelector('.aw-main');main.insertBefore(room,main.querySelector('.world-live-note'));
 for(const id of ['world-selection','world-chat-slot','world-show-analysis','world-analysis-slot','world-knowledge-slot'])room.querySelector('#room-content').append(host.querySelector('#'+id));
 const root=host.querySelector('#agent-world'),canvases=[...root.querySelectorAll('canvas[data-role]')],state={mode:'idle',playing:!matchMedia('(prefers-reduced-motion: reduce)').matches};let time=0,last=0,selected=null,raf=0;
 const roles={Grace:'营销增长智能体',Brian:'销售智能体',Jay:'经营决策智能体'};
 root.querySelectorAll('[data-advisor]').forEach(button=>button.onclick=event=>{if(!isAllowed())return;const next=button.dataset.advisor;if(onSelect(next,root.querySelector('#world-chat-slot'))===false)return;selected=next;room.hidden=false;root.classList.add('in-private-room');root.querySelector('#agents-view').hidden=true;root.querySelector('.welcome').hidden=true;room.dataset.persona=next;room.querySelector('canvas[data-role]').dataset.role={Jay:'0',Grace:'1',Brian:'2'}[next];root.querySelector('#room-title').textContent=next;root.querySelector('#room-purpose').textContent={Grace:'一起分析市场与渠道，把增长目标变成行动方案。',Brian:'一起梳理销售进展，制定可执行的跟进计划。',Jay:'一起汇总营销与销售，比较经营方案和资源取舍。'}[next];root.querySelector('#world-selection').textContent=roles[selected];root.querySelector('#world-show-analysis').hidden=false;root.querySelector('#room-purpose').textContent='说 Hello '+next+'，开始对话';room.dataset.window='closed';room.dataset.settings='false';room.querySelector('#room-compose').hidden=true;room.querySelector('#room-text').setAttribute('aria-expanded','false');room.querySelector('#room-results').setAttribute('aria-expanded','false');const form=root.querySelector('#ai-assistant-form');if(form)room.querySelector('#room-compose').append(form);root.querySelector('#room-title').focus({preventScroll:true});scrollTo(0,0);fitRoom();reveal=performance.now();renderLive();paint();
  // Grace opens straight into a voice conversation when the user clicked in (a real gesture is needed for the microphone).
  if(next==='Grace'&&event?.isTrusted)setTimeout(()=>{if(selected==='Grace'&&!room.hidden)room.querySelector('#room-start')?.click()},420);});
 root.querySelector('#room-back').onclick=()=>{if(!isAllowed()||onLeave?.()===false)return;restoreComposer();room.hidden=true;root.classList.remove('in-private-room');root.querySelector('#agents-view').hidden=false;root.querySelector('.welcome').hidden=false;root.querySelector('[data-advisor="'+selected+'"]').focus();selected=null;state.mode='idle';paint()};
 root.querySelectorAll('.advisor').forEach(card=>{card.addEventListener('pointerenter',()=>hot=card.querySelector('[data-advisor]')?.dataset.advisor||null);card.addEventListener('pointerleave',()=>hot=null)});
 addEventListener('pointermove',e=>{pointer={x:e.clientX/innerWidth,y:e.clientY/innerHeight}},{passive:true});
 root.querySelector('#world-show-analysis').onclick=()=>{if(isAllowed()&&selected)onAnalysis(selected,root.querySelector('#world-analysis-slot'))};
 function showWindow(open){room.dataset.window=open?'open':'closed';room.querySelector('#room-results').setAttribute('aria-expanded',String(open))}
 room.querySelector('#room-window-close').onclick=()=>{showWindow(false);room.querySelector('#room-results').focus()};
 room.querySelector('#room-results').onclick=()=>{room.dataset.settings='false';showWindow(room.dataset.window!=='open')};
 room.querySelector('#room-settings').onclick=()=>{room.dataset.settings='true';showWindow(true)};
 room.querySelector('#room-text').onclick=()=>{const slot=room.querySelector('#room-compose');slot.hidden=!slot.hidden;room.querySelector('#room-text').setAttribute('aria-expanded',String(!slot.hidden));if(!slot.hidden)slot.querySelector('textarea')?.focus()};
 room.querySelector('#room-start').onclick=()=>room.querySelector('[data-voice-start]')?.click();
 room.querySelector('#room-stop').onclick=()=>room.querySelector('[data-voice-stop]')?.click();
 function restoreComposer(){const form=room.querySelector('#ai-assistant-form');if(form)room.querySelector('#ai-assistant-panel')?.append(form)}
 function drawOrb(c,id){
const ctx=c.getContext('2d'),w=c.clientWidth,h=c.clientHeight,dpr=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);const z=Math.min(w/280,h/280);ctx.scale(z,z);
const rgb=id===1?'255,194,89':id===2?'71,213,255':'179,121,255',secondary=id===1?'130,59,24':id===2?'75,74,230':'235, ninety,180'.replace('ninety','90'),t=time,m=state.mode;
const speed=m==='thinking'?1.7:m==='listening'?.35:.65,phase=t*speed;
const aura=ctx.createRadialGradient(0,0,80,0,0,133);aura.addColorStop(0,`rgba(${rgb},0)`);aura.addColorStop(.6,`rgba(${rgb},.12)`);aura.addColorStop(1,`rgba(${rgb},0)`);ctx.fillStyle=aura;ctx.fillRect(-140,-140,280,280);
const glass=ctx.createRadialGradient(-32,-46,3,0,0,108);glass.addColorStop(0,'#1b2240');glass.addColorStop(.3,'#080d22');glass.addColorStop(.73,'#040816');glass.addColorStop(.94,`rgba(${rgb},.22)`);glass.addColorStop(1,'#050b17');ctx.fillStyle=glass;ctx.beginPath();ctx.arc(0,0,105,0,7);ctx.fill();
ctx.save();ctx.beginPath();ctx.arc(0,0,103,0,7);ctx.clip();
// Translucent ribbons form a fluid energy core, with no anatomical geometry.
for(let k=0;k<7;k++){
const rot=phase*(k%2?-.23:.3)+k*.88;ctx.save();ctx.rotate(rot);
const drift=Math.sin(phase+k)*22,fold=Math.cos(phase*.7+k)*27;
const g=ctx.createLinearGradient(-90,-80,90,90);g.addColorStop(0,`rgba(${rgb},0)`);g.addColorStop(.3,`rgba(${secondary},.025)`);g.addColorStop(.56,`rgba(${rgb},${k%2?.06:.13})`);g.addColorStop(.83,`rgba(${rgb},.36)`);g.addColorStop(1,`rgba(${rgb},0)`);
ctx.beginPath();ctx.moveTo(-103,-15+drift);ctx.bezierCurveTo(-55,-110,64,-88,101,12);ctx.bezierCurveTo(55,18+fold,35,98,-56,91);ctx.bezierCurveTo(-2,40,-45,-27,-103,-15+drift);ctx.fillStyle=g;ctx.fill();
ctx.beginPath();ctx.moveTo(-104,-15+drift);ctx.bezierCurveTo(-48,-48,17,72+fold,80,67);ctx.strokeStyle=`rgba(${rgb},.12)`;ctx.lineWidth=1.2;ctx.shadowColor=`rgb(${rgb})`;ctx.shadowBlur=9;ctx.stroke();ctx.restore();}
const spot=ctx.createRadialGradient(-35+Math.sin(phase)*30,69,0,-35+Math.sin(phase)*30,69,36);spot.addColorStop(0,`rgba(${rgb},.75)`);spot.addColorStop(.13,'#dffbff66');spot.addColorStop(1,`rgba(${rgb},0)`);ctx.fillStyle=spot;ctx.fillRect(-110,20,220,90);
ctx.restore();
// Flowing liquid-light boundary: radial waves travel around the orb.
const edgeSpeed=m==='thinking'?1.65:m==='listening'?.75:1;
function edgeRadius(a,layer){return 106+Math.sin(a*3-t*1.65*edgeSpeed+layer*.55)*3.3+Math.sin(a*5+t*.95*edgeSpeed+layer)*1.8+Math.sin(a*2-t*.65)*2.1+layer*.8}
for(let layer=4;layer>=0;layer--){ctx.beginPath();for(let j=0;j<=240;j++){const a=j/240*Math.PI*2,r=edgeRadius(a,layer);const x=Math.cos(a)*r,y=Math.sin(a)*r;if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.strokeStyle=`rgba(${rgb},${layer===0?.58:.1})`;ctx.lineWidth=layer===0?1.5:3;ctx.shadowColor=`rgb(${rgb})`;ctx.shadowBlur=layer===0?10:16;ctx.stroke()}
// Comet highlights follow the changing contour, tapering into soft tails.
for(let k=0;k<3;k++){const head=t*.7*edgeSpeed+k*Math.PI*2/3+Math.sin(t*.5+k)*.2;
for(let j=0;j<32;j++){const a=head-j*.017,r=edgeRadius(a,0),r2=edgeRadius(a-.02,0);ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.lineTo(Math.cos(a-.02)*r2,Math.sin(a-.02)*r2);ctx.strokeStyle=j<4?`rgba(232,251,255,${.9-j*.07})`:`rgba(${rgb},${.65*(1-j/32)**2})`;ctx.lineWidth=1+3*(1-j/32);ctx.shadowBlur=12;ctx.stroke()}}
ctx.shadowBlur=0;
ctx.strokeStyle='#effcff25';ctx.lineWidth=2;ctx.beginPath();ctx.arc(-1,-1,98,3.5,4.6);ctx.stroke();
if(m==='listening'){for(let k=0;k<3;k++){const f=(t*.55+k/3)%1;ctx.strokeStyle=`rgba(${rgb},${.55*(1-f)})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,130-f*21,-.85,.85);ctx.stroke();ctx.beginPath();ctx.arc(0,0,130-f*21,Math.PI-.85,Math.PI+.85);ctx.stroke()}}
if(m==='thinking'){ctx.save();ctx.rotate(t*1.9);ctx.strokeStyle=`rgba(${rgb},.9)`;ctx.lineWidth=2;for(let k=0;k<3;k++){ctx.beginPath();ctx.arc(0,0,117,k*2.094,k*2.094+.72);ctx.stroke()}ctx.restore();for(let k=0;k<10;k++){const a=t*1.7+k*.628,r=30+15*Math.sin(t+k);ctx.fillStyle=`rgba(${rgb},.65)`;ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r*.5,1.6,0,7);ctx.fill()}}
if(m==='speaking'){ctx.strokeStyle=`rgba(${rgb},.95)`;ctx.shadowColor=`rgb(${rgb})`;ctx.shadowBlur=9;ctx.lineWidth=2;ctx.beginPath();for(let x=-75;x<=75;x++){const y=Math.sin(x*.16+t*9)*Math.sin((x+75)/150*Math.PI)*(9+9*Math.sin(t*3)**2);if(x===-75)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();ctx.shadowBlur=0;const f=(t*.6)%1;ctx.strokeStyle=`rgba(${rgb},${.4*(1-f)})`;ctx.beginPath();ctx.arc(0,0,110+f*20,0,7);ctx.stroke()}
ctx.restore();}


 // ---- particle holograms (fallback to the 2D orb until data loads or when WebGL2 is unavailable)
 const STYLE={0:1,1:0,2:2},NAME={0:'Jay',1:'Grace',2:'Brian'},HUE={Grace:0,Jay:1,Brian:2};
 let holo=null,reveal=performance.now(),hot=null,pointer={x:.5,y:.4},liveTimer=0;const views=new Map(),pose=new Map(),w={listen:0,think:0,speak:0};let level=0,externalLevel=null,rainLayer=null;
 const webgl2=(()=>{try{return !!document.createElement('canvas').getContext('webgl2')}catch{return false}})();
 (webgl2?loadHologram(new URL('./agent-hologram-surface.bin',import.meta.url)):Promise.reject()).then(data=>{holo=data;reveal=performance.now()}).catch(()=>{holo=false});
 function view(c){if(!holo)return null;if(!views.has(c)){let v=null;try{v=createHologram(c,holo)}catch(err){console.warn('全息形态初始化失败',err)}views.set(c,v)}return views.get(c)}
 function draw(c,id,dt=0){
  if(holo===null)return; // data still loading: keep the canvas blank so WebGL can claim it
  const v=view(c);if(!v){drawOrb(c,id);return}
  const inRoom=!!c.closest('#agent-private-room'),style=STYLE[id]??0,name=NAME[id],h=inRoom?1:(hot===name?1:0);
  const p=pose.get(c)||{yaw:0,pitch:0,hot:0};const r=c.getBoundingClientRect(),cx=(r.left+r.width/2)/innerWidth,cy=(r.top+r.height*.42)/innerHeight;
  const ty=inRoom||hot===name?Math.max(-.6,Math.min(.6,(pointer.x-cx)*1.5)):(1-id)*.25,tp=inRoom||hot===name?Math.max(-.25,Math.min(.25,(pointer.y-cy)*.7)):0,k=1-Math.exp(-dt*2.4);
  p.yaw+=(ty-p.yaw)*k;p.pitch+=(tp-p.pitch)*k;p.hot+=(h-p.hot)*(1-Math.exp(-dt*5));pose.set(c,p);
  const m=inRoom?w:{listen:0,think:p.hot*.3,speak:0},lv=inRoom?level:0;
  v.render(style,{time,yaw:p.yaw-.16*m.think*Math.sin(time*.35+.6)-.05*m.think,pitch:p.pitch+.1*m.think-.05*m.listen+.03*m.speak*lv,listen:m.listen,think:m.think,speak:m.speak,level:lv,reveal:state.playing?Math.min(1,(performance.now()-reveal)/2200):1,focus:inRoom?.78*(1+.025*m.listen):.82,dim:!inRoom&&hot&&hot!==name?.5:1});
  const hud=c.parentElement.querySelector('.aw-hud');
  if(hud){if(inRoom){drawRoomHud(hud,{t:time,style,listen:w.listen,think:w.think,speak:w.speak,level,callouts:liveCallouts});drawPedestal(hud,{t:time,style,hot:1,clear:false})}else drawPedestal(hud,{t:time,style,hot:p.hot})}
  const rain=c.parentElement.querySelector('.aw-rain');if(rain&&inRoom){rainLayer=rainLayer||createRain(rain);rainLayer.draw({t:time,dt,style,strength:.45})}
 }
 // ---- live board in the private room (real CRM data supplied by the page)
 let liveCallouts=[];
 function renderLive(){
  const box=room.querySelector('#room-live');if(!box||!selected)return;let live=null;try{live=getLive?.(selected)}catch(err){console.warn('实时看板读取失败',err)}
  box.replaceChildren();const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
  const head=el('div','live-head');head.append(el('strong',null,'实时看板'),el('span',null,live?.period||'看板周期未加载'));box.append(head);
  if(!live||!live.ready){box.append(el('p','live-empty','CRM 数据尚未加载完成，稍后自动刷新。'));liveCallouts=[];return}
  const grid=el('div','live-metrics');for(const m of live.metrics){const card=el('div','live-metric');card.append(el('b',null,m.value),el('span',null,m.label));grid.append(card)}box.append(grid);
  const src=el('ul','live-sources');for(const s of live.sources){const li=el('li');li.append(el('span',null,s.name),el('i','pill '+s.state,s.text));src.append(li)}box.append(el('div','live-sub','数据连接'),src);
  if(live.focus?.length){const list=el('ul','live-focus');for(const f of live.focus)list.append(el('li',null,f));box.append(el('div','live-sub','今日关注'),list)}
  box.append(el('p','live-note',live.note||''));
  liveCallouts=live.metrics.slice(0,3).map(m=>[m.code||'',m.label,m.value]);
 }
 function paint(dt=0){if(typeof dt!=='number')dt=0;if(!isAllowed()||host.classList.contains('hidden'))return;canvases.filter(c=>c.clientWidth&&c.clientHeight).forEach(c=>draw(c,Number(c.dataset.role),dt))}
 function frame(ts){if(!root.isConnected)return;const dt=Math.min(.033,(ts-last)/1000||0);if(state.playing&&!document.hidden&&!host.classList.contains('hidden')&&isAllowed()){time+=dt;
  const target=state.mode;const k=1-Math.exp(-dt*3.4);w.listen+=((target==='listening')-w.listen)*k;w.think+=((target==='thinking')-w.think)*k;w.speak+=((target==='speaking')-w.speak)*k;
  const lv=externalLevel??speechLevel(time);level+=(lv-level)*(1-Math.exp(-dt*18));
  paint(dt);if(selected&&!room.hidden&&(liveTimer+=dt)>15){liveTimer=0;renderLive()}}last=ts;raf=requestAnimationFrame(frame)}
 // The private room fits one screen: its height is the space left below the page header.
 function fitRoom(){const top=root.getBoundingClientRect().top+scrollY;let h=Math.max(560,innerHeight-top-14);root.style.setProperty('--room-h',h+'px');if(!root.classList.contains('in-private-room'))return;const extra=document.documentElement.scrollHeight-innerHeight;if(extra>0){h=Math.max(560,h-extra);root.style.setProperty('--room-h',h+'px')}}
 addEventListener('resize',fitRoom,{passive:true});fitRoom();
 const resize=new ResizeObserver(paint);resize.observe(host);paint();raf=requestAnimationFrame(frame);
 return {showResponse(){if(selected){room.dataset.settings='false';showWindow(true)}},closeWindow(){showWindow(false)},restoreComposer,setStatus(text){room.querySelector('#room-voice-status').textContent=text},setMode(mode){state.mode=mode;room.dataset.mode=mode},setLevel(value){externalLevel=Number.isFinite(value)?Math.max(0,Math.min(1,value)):null},refreshLive:renderLive,dispose(){cancelAnimationFrame(raf);resize.disconnect()}};
}
