export function canUseAgentWorld(profile,user){
 return Boolean(profile?.active && profile.role==='owner' && profile.id==='c43bd3c2-6e3a-4228-99c7-dc95f33643f2' && user?.id===profile.id && String(user?.email||'').toLowerCase()==='chloelee@wonlyglobal.com');
}
export function mountAgentWorld(host,{onSelect,onAnalysis,isAllowed}){
 if(!isAllowed())throw new Error('当前账号无权进入智能体世界');
 host.innerHTML="<div id=\"agent-world\"><main class=\"aw-main\"><div class=\"welcome\"><div class=\"eyebrow\">WELCOME TO YOUR AGENT WORLD</div><h1>欢迎进入王力CRM系统</h1><p>让每一个经营问题，都找到合适的智能体。</p></div><section id=\"agents-view\" aria-label=\"智能体世界\"><div class=\"constellation\">\n<article class=\"advisor\" style=\"--tone:#edc476\"><button class=\"open-orb\" data-advisor=\"Grace\" aria-label=\"与 Grace 营销增长智能体对话\"><canvas data-role=\"1\" aria-label=\"Grace 琥珀金动态脑核\"></canvas></button><h2>Grace</h2><div class=\"job\">营销增长智能体</div><p class=\"desc\">洞察渠道与线索，让增长方向更清晰。</p><button class=\"enter\" data-advisor=\"Grace\">进入 Grace</button></article>\n<article class=\"advisor\" style=\"--tone:#bca1f3\"><button class=\"open-orb\" data-advisor=\"Jay\" aria-label=\"与 Jay 经营决策智能体对话\"><canvas data-role=\"0\" aria-label=\"Jay 紫罗兰动态脑核\"></canvas></button><h2>Jay</h2><div class=\"job\">经营决策智能体</div><p class=\"desc\">汇总营销与销售洞察，辅助经营决策。</p><button class=\"enter\" data-advisor=\"Jay\">进入 Jay</button></article>\n<article class=\"advisor\" style=\"--tone:#7bd5f7\"><button class=\"open-orb\" data-advisor=\"Brian\" aria-label=\"与 Brian 销售智能体对话\"><canvas data-role=\"2\" aria-label=\"Brian 冰蓝动态脑核\"></canvas></button><h2>Brian</h2><div class=\"job\">销售智能体</div><p class=\"desc\">梳理客户进展，让下一步跟进更明确。</p><button class=\"enter\" data-advisor=\"Brian\">进入 Brian</button></article>\n</div><div class=\"coord\">Grace 营销洞察 → Jay 经营统筹 ← Brian 销售进展</div><div class=\"command\"><span aria-hidden=\"true\">✧</span><div><p>今天，你想先解决什么问题？</p><small>选择一位智能体，开始对话</small></div></div></section>\n<div class=\"world-live-note\">沿用当前账号的数据权限与看板统计周期。自动定期汇报和语音唤醒尚未启用。</div><div id=\"world-selection\" class=\"world-section-title\" aria-live=\"polite\">请选择一位智能体</div><div id=\"world-chat-slot\"></div><button type=\"button\" id=\"world-show-analysis\" class=\"world-analysis-toggle\" hidden>查看当前智能体的证据与建议</button><div id=\"world-analysis-slot\"></div><footer class=\"foot\"><span>所有执行仍需人工确认 · 数据范围不因切换智能体改变</span><button id=\"world-motion\">暂停动效</button></footer></main></div>";
 const root=host.querySelector('#agent-world'),canvases=[...root.querySelectorAll('canvas')],state={mode:'idle',playing:!matchMedia('(prefers-reduced-motion: reduce)').matches};let time=0,last=0,selected=null,raf=0;
 const roles={Grace:'营销增长智能体',Brian:'销售智能体',Jay:'经营决策智能体'};
 root.querySelectorAll('[data-advisor]').forEach(button=>button.onclick=()=>{if(!isAllowed())return;selected=button.dataset.advisor;root.querySelector('#world-selection').textContent=selected+' · '+roles[selected];root.querySelector('#world-show-analysis').hidden=false;onSelect(selected,root.querySelector('#world-chat-slot'));});
 root.querySelector('#world-show-analysis').onclick=()=>{if(isAllowed()&&selected)onAnalysis(selected,root.querySelector('#world-analysis-slot'))};
 const motion=root.querySelector('#world-motion');function syncMotion(){motion.textContent=state.playing?'暂停动效':'播放动效';motion.setAttribute('aria-pressed',String(!state.playing))}motion.onclick=()=>{state.playing=!state.playing;syncMotion()};syncMotion();
 function draw(c,id){
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


 function paint(){if(!isAllowed()||host.classList.contains('hidden'))return;canvases.forEach(c=>draw(c,Number(c.dataset.role)))}
 function frame(ts){if(!root.isConnected)return;if(state.playing&&!document.hidden&&!host.classList.contains('hidden')&&isAllowed()){time+=Math.min(.05,(ts-last)/1000);paint()}last=ts;raf=requestAnimationFrame(frame)}
 const resize=new ResizeObserver(paint);resize.observe(host);paint();raf=requestAnimationFrame(frame);
 return {setMode(mode){state.mode=mode;paint()},dispose(){cancelAnimationFrame(raf);resize.disconnect()}};
}
