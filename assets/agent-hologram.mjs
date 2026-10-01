// Particle-hologram agents for the agent world (WebGL2). Shape data is precomputed by
// scripts/generate-hologram-surface.mjs; this file only animates it. Styles: 0 Grace, 1 Jay, 2 Brian.
export const TONES=['255,184,81','180,138,255','71,205,255'];
const PALETTE=[[[1,.66,.25],[1,.95,.78]],[[.62,.42,1],[.93,.84,1]],[[.2,.74,1],[.82,.98,1]]];
export async function loadHologram(url){
 const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error('hologram data '+r.status);const buf=await r.arrayBuffer();
 const head=new Uint32Array(buf,0,4);if(head[0]!==0x484f4c4f)throw new Error('hologram data invalid');
 const N=head[1],nc=head[2],nj=head[3],al=n=>n+((4-n%4)%4);let o=16;
 const pos16=new Int16Array(buf,o,N*3);o+=al(N*6);const n8=new Int8Array(buf,o,N*3);o+=al(N*3);const f8=new Uint8Array(buf,o,N);o+=al(N);
 const circuit=new Uint16Array(buf,o,nc);o+=al(nc*2);const jay=new Uint16Array(buf,o,nj);
 const pos=new Float32Array(N*3),nrm=new Float32Array(N*3),feat=new Float32Array(N);
 for(let i=0;i<N*3;i++){pos[i]=pos16[i]/16000;nrm[i]=n8[i]/127}for(let i=0;i<N;i++)feat[i]=f8[i]/255;
 return{N,pos,nrm,feat,circuit,jay};
}
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function buildStyle(D,style){
 const r=rng(101+style*977),pos=[],rnd=[],info=[],nrm=[];
 const push=(x,y,z,k,mouth,feat,top,nx=0,ny=0,nz=1)=>{pos.push(x,y,z);rnd.push(r(),r(),r(),r());info.push(k,mouth,feat,top);nrm.push(nx,ny,nz)};
 const scalp=[];
 for(let i=0;i<D.N;i++){const x=D.pos[i*3],y=D.pos[i*3+1],z=D.pos[i*3+2],front=z>.25?1:0;
  const mouth=front*Math.exp(-((x/.12)**2+((y-.065)/.05)**2)),jaw=front*(y<.07&&y>-.24&&Math.abs(x)<.3?Math.min(1,(.07-y)/.12):0);
  push(x,y,z,0,Math.max(mouth,jaw*.85),D.feat[i],Math.max(0,Math.min(1,(y-.55)/.42)),D.nrm[i*3],D.nrm[i*3+1],D.nrm[i*3+2]);if(y>.25&&z<.25)scalp.push(i)}
 const extra=style===0?1700:style===1?700:1300;
 for(let i=0;i<extra;i++){if(style===0){const j=scalp[Math.floor(r()*scalp.length)];push(D.pos[j*3],D.pos[j*3+1],D.pos[j*3+2],1,0,0,0)}else push(0,.3,0,1,0,0,0)}
 for(let i=0;i<260;i++)push((r()*2-1)*1.5,r()*2.6-1.2,(r()*2-1)*1,2,0,0,0);
 for(let i=0;i<520;i++)push(0,-1.2,0,3,0,0,0);
 const lines=style===1?[...D.circuit,...D.jay]:[...D.circuit];
 return{pos:new Float32Array(pos),rnd:new Float32Array(rnd),info:new Float32Array(info),nrm:new Float32Array(nrm),count:pos.length/3,lines:new Uint16Array(lines)};
}
const VS=`#version 300 es
precision highp float;
in vec3 aPos;in vec4 aRnd;in vec4 aInfo;in vec3 aNrm;
uniform float uTime,uYaw,uPitch,uAspect,uListen,uThink,uSpeak,uLevel,uStyle,uSize,uReveal,uLine,uFocus,uShiftX,uDim,uGlow;
out float vAlpha;out float vHi;
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
float hash(float n){return fract(sin(n)*43758.5453);}
void main(){
  float t=uTime,kind=aInfo.x;vec3 p=aPos;
  vec3 c=vec3(0.,p.y>-.45?.3:-.9,p.y>-.45?0.:-.06);vec3 n=normalize(p-c+1e-4);
  float hi=0.;
  if(kind<.5){
    // idle: slow breath that travels up the body as a soft brightness wave
    float breath=sin(t*1.05);
    p*=1.+.006*breath;
    p+=n*.008*sin(t*1.3+aRnd.x*6.283)*(1.-.7*uListen);   // listening settles the surface
    hi+=.12*sin(p.y*3.2-t*1.05);
    // listening: attention gathers on the front of the face, gently and evenly
    float front=smoothstep(.05,.55,p.z);
    p-=n*.006*uListen;
    hi+=uListen*front*(.28+.12*sin(t*1.6));
    // speaking: a small jaw movement and light that swells with the voice from the lower face
    p.y-=uSpeak*uLevel*aInfo.y*.032;
    float dm=length(aPos-vec3(0.,.04,.45));
    p+=n*uSpeak*uLevel*.012*exp(-dm*2.2);
    hi+=uSpeak*uLevel*(.25*front+.55*exp(-dm*2.4));
    // thinking: faint signals travel across the surface in different directions; the form loosens a little
    if(uThink>.001){
      for(int k=0;k<3;k++){float fk=float(k);
        vec3 dir=normalize(vec3(sin(fk*2.1+t*.11),cos(fk*1.7+.4),sin(fk*3.3+t*.07)));
        float front2=fract(t*.23+fk*.37)*2.6-1.3;float dd=dot(aPos-vec3(0.,.2,0.),dir)-front2;
        hi+=uThink*.75*exp(-dd*dd*90.)*smoothstep(-.9,.4,aPos.y);}
      p+=n*uThink*.009*sin(t*2.3+aRnd.y*31.);
    }
    hi+=aInfo.z*.5;
    float sb=mod(t*.35,3.)-1.4;hi+=smoothstep(.12,0.,abs(p.y-sb))*.7;
    // signature surface effects
    if(uStyle<.5){hi+=step(.985,fract(aRnd.w*7.+t*.35))*1.2;}
    else if(uStyle<1.5){hi+=.35*smoothstep(.6,1.,sin(t*1.3+aRnd.w*6.283));}
    else{float sy=mod(t*.55,2.8)-1.25;hi+=smoothstep(.07,0.,abs(p.y-sy))*1.3;}
  }else if(kind<1.5){
    float s=fract(aRnd.y+t*(.05+.05*aRnd.z)*(1.+uThink*.4));
    if(uStyle<.5){ // Grace: silk streams flowing back from the scalp
      vec3 o=aPos;float sway=sin(t*.9+aRnd.x*6.283+s*4.)*.18*s;
      p=o+vec3(sway+o.x*.6*s,-s*(1.05+.4*aRnd.z)+.08*sin(s*6.+t),-s*(.55+.35*aRnd.x));
      vAlpha=0.;hi=.2+.6*(1.-s);
      
    }else if(uStyle<1.5){ // Jay: tilted halo of slow orbiting points
      float a=aRnd.x*6.283+t*(.25+uThink*.25)*(aRnd.z>.5?1.:-1.);float rr=.62+.06*sin(aRnd.y*30.+t);
      p=vec3(cos(a)*rr,.94+.04*sin(a*3.+t),sin(a)*rr*.55);hi=.4+uThink*.25;
    }else{ // Brian: three tilted orbits like a moving pipeline
      float ring=floor(aRnd.w*3.);float a=aRnd.x*6.283+t*(.45+ring*.15)*(1.+uThink*.35);float rr=1.02+ring*.12+uListen*.02*sin(t*1.5+aRnd.y*6.);
      vec3 q=vec3(cos(a)*rr,0.,sin(a)*rr);q=rotX(.35+ring*.55)*rotY(ring*1.9)*q;p=q+vec3(0.,.25,0.);
      hi=.3+.7*step(.92,fract(aRnd.y*13.+t*.6))+uThink*.15;
    }
  }else if(kind>2.5){ // projector beam: light rising from the emitter ring
    float s=fract(aRnd.y+t*(.12+.1*aRnd.z));float a=aRnd.x*6.283+t*.2;float rr=.95*sqrt(aRnd.w)*(1.-s*.55);
    p=vec3(cos(a)*rr,-1.22+s*.75,sin(a)*rr*.5);hi=.1;
  }else{ // ambient dust
    p=aPos+vec3(sin(t*.13+aRnd.x*6.)*.08,mod(t*.03+aRnd.y,1.)*.4-.2,cos(t*.11+aRnd.z*6.)*.08);
    hi=-.3;
  }
  // entrance: particles gather from a loose cloud
  float rv=smoothstep(aRnd.w*.55,aRnd.w*.55+.45,uReveal);
  vec3 cloud=vec3((aRnd.x-.5)*4.,(aRnd.y-.5)*4.,(aRnd.z-.5)*3.);
  p=mix(cloud,p,rv);
  // head turn follows the pointer with a little idle sway
  vec3 w=rotY(uYaw+sin(t*.23)*.12)*rotX(uPitch+sin(t*.17)*.04)*(p-vec3(0.,.15,0.));
  float persp=1./(3.3-w.z);
  float scale=2.15*(uFocus);
  gl_Position=vec4(w.x*persp*scale/uAspect+uShiftX,(w.y+.04)*persp*scale,0.,1.);
  float depth=clamp((w.z+.9)/1.6,0.,1.);
  vec3 vn=rotY(uYaw+sin(t*.23)*.12)*rotX(uPitch+sin(t*.17)*.04)*aNrm;float rim=kind<.5?pow(1.-abs(vn.z),2.5)*(1.-.75*exp(-pow((aPos.y-.38)/.12,2.))):0.;hi+=rim*.4;
  float a=(kind<.5?.35+.65*depth:kind<1.5?.75:kind>2.5?.5*(1.-fract(aRnd.y+t*(.12+.1*aRnd.z))):.25)*rv;
  if(kind>.5&&kind<1.5&&uStyle<.5){float s=fract(aRnd.y+t*(.05+.05*aRnd.z)*(1.+uThink*.4));a*=smoothstep(0.,.08,s)*(1.-s);}
  vAlpha=a*(uLine>.5?.34*depth:1.)*uDim;vHi=hi;
  if(uLine>.5)hi+=smoothstep(.96,1.,fract(aPos.x*1.7+aPos.z*1.3-t*.35))*1.5;
  gl_PointSize=uSize*persp*(.55+aRnd.z*.9)*(1.+max(hi,0.)*.35)*mix(1.,3.4,uGlow);
  vAlpha*=mix(1.,.045,uGlow);
}`;
const FS=`#version 300 es
precision highp float;
in float vAlpha;in float vHi;uniform vec3 uBase,uHot;uniform float uLine;out vec4 o;
void main(){
  float a=vAlpha;
  if(uLine<.5){vec2 q=gl_PointCoord-.5;float d=dot(q,q)*4.;a*=exp(-d*3.2);}
  vec3 col=mix(uBase,uHot,clamp(vHi,0.,1.));
  o=vec4(col*a,a);
}`;

function compile(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
const UNIFORMS=['uTime','uYaw','uPitch','uAspect','uListen','uThink','uSpeak','uLevel','uStyle','uSize','uReveal','uLine','uFocus','uShiftX','uDim','uGlow','uBase','uHot'];
export function createHologram(canvas,data){
 const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true});if(!gl)return null;
 const prog=gl.createProgram();gl.attachShader(prog,compile(gl,gl.VERTEX_SHADER,VS));gl.attachShader(prog,compile(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);
 if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
 const U={};for(const n of UNIFORMS)U[n]=gl.getUniformLocation(prog,n);
 const sets=[];
 function set(style){if(sets[style])return sets[style];const S=buildStyle(data,style),vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const attr=(name,arr,size)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.STATIC_DRAW);const loc=gl.getAttribLocation(prog,name);if(loc<0)return;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0)};
  attr('aPos',S.pos,3);attr('aRnd',S.rnd,4);attr('aInfo',S.info,4);attr('aNrm',S.nrm,3);
  const ebo=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ebo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,S.lines,gl.STATIC_DRAW);
  gl.bindVertexArray(null);return sets[style]={vao,count:S.count,lines:S.lines.length}}
 return{
  render(style,o){
   const dpr=Math.min(devicePixelRatio||1,1.5),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
   if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
   const S=set(style);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.useProgram(prog);gl.bindVertexArray(S.vao);
   const aspect=canvas.width/canvas.height;
   gl.uniform1f(U.uTime,o.time+style*7.1);gl.uniform1f(U.uYaw,o.yaw||0);gl.uniform1f(U.uPitch,o.pitch||0);gl.uniform1f(U.uAspect,aspect);
   gl.uniform1f(U.uListen,o.listen||0);gl.uniform1f(U.uThink,o.think||0);gl.uniform1f(U.uSpeak,o.speak||0);gl.uniform1f(U.uLevel,o.level||0);gl.uniform1f(U.uStyle,style);
   gl.uniform1f(U.uSize,(canvas.height/520)*8.5*(o.sizeScale||1));gl.uniform1f(U.uReveal,o.reveal??1);gl.uniform1f(U.uFocus,Math.min(1.05,aspect*1.05)*(o.focus||.78));gl.uniform1f(U.uShiftX,0);gl.uniform1f(U.uDim,o.dim??1);
   const[b,hh]=PALETTE[style];gl.uniform3f(U.uBase,...b);gl.uniform3f(U.uHot,...hh);
   gl.uniform1f(U.uGlow,0);gl.uniform1f(U.uLine,1);gl.drawElements(gl.LINES,S.lines,gl.UNSIGNED_SHORT,0);
   gl.uniform1f(U.uLine,0);gl.uniform1f(U.uGlow,1);gl.drawArrays(gl.POINTS,0,S.count);gl.uniform1f(U.uGlow,0);gl.drawArrays(gl.POINTS,0,S.count);
   gl.bindVertexArray(null);
  }
 };
}
// Smooth voice envelope used until a real output level is supplied.
export function speechLevel(t){const phrase=Math.max(0,Math.sin(t*.9))**.4,syll=Math.max(0,Math.sin(t*10.5))*.65+Math.max(0,Math.sin(t*6.3+1.3))*.45;return Math.min(1,phrase*syll)}
function fit(canvas,clear=true){const dpr=Math.min(devicePixelRatio||1,1.5),w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);if(clear)c.clearRect(0,0,w,h);return{c,w,h}}
// Projector under the bust (lobby and room).
export function drawPedestal(canvas,{t,style,hot=0,clear=true}){
 const{c,w,h}=fit(canvas,clear);if(!w)return;const rgb=TONES[style],col=a=>`rgba(${rgb},${a})`,x=w/2,by=h*.93,bw=Math.min(w*.36,150),bh=bw*.16;
 const beam=c.createLinearGradient(0,by,0,by-h*.75);beam.addColorStop(0,col(.14+.14*hot));beam.addColorStop(1,col(0));c.fillStyle=beam;c.beginPath();c.moveTo(x-bw,by);c.lineTo(x-bw*.5,by-h*.75);c.lineTo(x+bw*.5,by-h*.75);c.lineTo(x+bw,by);c.closePath();c.fill();
 for(let k=0;k<3;k++){c.strokeStyle=col(.5-k*.14+hot*.3);c.lineWidth=k?1:1.5;c.setLineDash(k===1?[3,6]:[]);c.lineDashOffset=-t*20;c.beginPath();c.ellipse(x,by+k*5,bw*(1-k*.12),bh*(1-k*.12),0,0,Math.PI*2);c.stroke()}c.setLineDash([]);
}
// Rings, voice bars and live callouts around the agent in the private room.
export function drawRoomHud(canvas,{t,style,listen=0,think=0,speak=0,level=0,callouts=[]}){
 const{c,w,h}=fit(canvas);if(!w)return;const rgb=TONES[style],col=a=>`rgba(${rgb},${a*.8})`,cx=w/2,cy=h*.47,R=Math.min(w*.8,h)*.36,spin=1+think*.6;c.lineCap='round';
 c.save();c.translate(cx,cy);c.rotate(t*.05*spin);for(let i=0;i<120;i++){const a=i/120*Math.PI*2,major=i%10===0;c.strokeStyle=col(major?.5:.16);c.lineWidth=major?1.3:1;c.beginPath();c.moveTo(Math.cos(a)*R*1.02,Math.sin(a)*R*1.02);c.lineTo(Math.cos(a)*R*(major?1.07:1.04),Math.sin(a)*R*(major?1.07:1.04));c.stroke()}c.restore();
 for(const[r,sp,segs,lw]of[[R*.93,.18,[[0,.9],[1.3,1.8],[3.4,4.6]],1.5],[R*.86,-.27,[[.5,1.1],[2.2,3.9],[4.9,5.4]],1.1]]){c.save();c.translate(cx,cy);c.rotate(t*sp*spin);c.strokeStyle=col(.38+think*.2);c.lineWidth=lw;for(const[a,b]of segs){c.beginPath();c.arc(0,0,r,a,b);c.stroke()}c.restore()}
 const v=Math.max(speak*level,listen*.18);
 if(v>.01){c.save();c.translate(cx,cy);for(let i=0;i<96;i++){const a=i/96*Math.PI*2-Math.PI/2,n=.5+.5*Math.sin(i*1.7+t*8)*Math.sin(i*.33-t*3),len=R*.12*v*(.25+n);c.strokeStyle=col(.3+.6*v*n);c.lineWidth=2;c.beginPath();c.moveTo(Math.cos(a)*R*1.18,Math.sin(a)*R*1.18);c.lineTo(Math.cos(a)*(R*1.18+len),Math.sin(a)*(R*1.18+len));c.stroke()}c.restore()}
 if(listen>.02)for(let k=0;k<2;k++){const f=(t*.25+k/2)%1;c.strokeStyle=col(.25*listen*Math.sin(f*Math.PI));c.lineWidth=1.5;c.beginPath();c.arc(cx,cy,R*(1.3-f*.4),0,Math.PI*2);c.stroke()}
 if(w>440){const angs=[-2.45,-.7,2.55];c.font='500 10px ui-monospace,Menlo,monospace';
  callouts.slice(0,3).forEach(([k,label,txt],i)=>{const a=angs[i],px=cx+Math.cos(a)*R*.98,py=cy+Math.sin(a)*R*.98,right=Math.cos(a)>0,ex=cx+Math.cos(a)*R*1.3,ey=cy+Math.sin(a)*R*1.3,tx=ex+(right?40:-40),ox=tx+(right?6:-6);
   c.strokeStyle=col(.5);c.lineWidth=1;c.beginPath();c.moveTo(px,py);c.lineTo(ex,ey);c.lineTo(tx,ey);c.stroke();c.fillStyle=col(.9);c.beginPath();c.arc(px,py,2.5,0,Math.PI*2);c.fill();
   c.textAlign=right?'left':'right';c.fillStyle=col(.6);c.fillText(k,ox,ey-14);c.fillStyle='rgba(235,245,255,.95)';c.font='600 15px system-ui,sans-serif';c.fillText(txt,ox,ey+4);c.font='400 11px system-ui,sans-serif';c.fillStyle=col(.6);c.fillText(label,ox,ey+19);c.font='500 10px ui-monospace,Menlo,monospace'})}
}
// Falling glyph columns behind the agent.
const GLYPHS='0123456789ABCDEF<>/{}[]=+:;$#*%';
export function createRain(canvas){
 const cols=[];let W=0,H=0;
 return{draw({t,dt,style,strength=.5}){const{c,w,h}=fit(canvas);if(!w)return;if(w!==W||h!==H){W=w;H=h;cols.length=0;for(let i=0;i<Math.floor(w/16);i++)cols.push({x:i*16+8,y:Math.random()*h,v:30+Math.random()*70,len:8+Math.floor(Math.random()*18),seed:Math.random()*1000})}
  const rgb=TONES[style];c.font='600 12px ui-monospace,Menlo,monospace';c.textAlign='center';
  for(const col of cols){col.y+=col.v*dt;if(col.y-col.len*15>h){col.y=-Math.random()*h*.3;col.v=30+Math.random()*70}
   const dist=Math.abs(col.x-w/2)/(w/2),fade=(.25+.75*Math.min(1,dist*1.6))*strength;
   for(let k=0;k<col.len;k++){const y=col.y-k*15;if(y<-15||y>h+15)continue;const a=(k===0?.85:.42*(1-k/col.len))*fade*(y<h*.15?Math.max(0,y)/(h*.15):1);
    const ch=GLYPHS[Math.floor(Math.abs(Math.sin(col.seed+k*7.3+Math.floor(t*6+k)*.37))*GLYPHS.length)%GLYPHS.length];c.fillStyle=k===0?`rgba(235,245,255,${a})`:`rgba(${rgb},${a})`;c.fillText(ch,col.x,y)}}}};
}
