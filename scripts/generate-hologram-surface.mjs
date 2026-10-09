// Generates assets/agent-hologram-surface.bin: the particle bust used by the agent world.
// Deterministic (seeded); run `node scripts/generate-hologram-surface.mjs` after changing the shape.
import {writeFileSync} from 'node:fs';
function ell(p,c,r){const qx=(p[0]-c[0])/r[0],qy=(p[1]-c[1])/r[1],qz=(p[2]-c[2])/r[2];const k0=Math.hypot(qx,qy,qz),k1=Math.hypot(qx/r[0],qy/r[1],qz/r[2]);return k0*(k0-1)/k1}
function smin(a,b,k){const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25}
function smax(a,b,k){return -smin(-a,-b,k)}
function cap(p,a,b,r){const pa=[p[0]-a[0],p[1]-a[1],p[2]-a[2]],ba=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];const h=Math.max(0,Math.min(1,(pa[0]*ba[0]+pa[1]*ba[1]+pa[2]*ba[2])/(ba[0]*ba[0]+ba[1]*ba[1]+ba[2]*ba[2])));return Math.hypot(pa[0]-ba[0]*h,pa[1]-ba[1]*h,pa[2]-ba[2]*h)-r}
function sdf(p){
  const X=Math.abs(p[0]),q=[X,p[1],p[2]];                    // mirror for symmetric features
  let d=ell(p,[0,.45,-.06],[.44,.56,.54]);                    // cranium
  d=smin(d,ell(p,[0,.12,.12],[.34,.38,.4]),.16);              // face mass
  d=smin(d,ell(p,[0,-.12,.33],[.12,.09,.1]),.1);              // chin
  d=smin(d,ell(q,[.26,.02,.05],[.1,.12,.18]),.08);            // jaw angle
  d=smin(d,ell(q,[.21,.28,.3],[.12,.07,.12]),.08);            // cheekbone
  d=smin(d,ell(p,[0,.47,.4],[.3,.055,.1]),.06);               // brow ridge
  d=smax(d,-(Math.hypot(X-.15,p[1]-.37,p[2]-.535)-.05),.07);   // shallow brow shadow, no eye detail
  d=smin(d,cap(p,[0,.42,.47],[0,.27,.585],.035),.04);         // nose bridge
  d=smin(d,ell(p,[0,.245,.585],[.05,.045,.05]),.03);          // nose tip
  d=smin(d,ell(q,[.045,.225,.535],[.03,.025,.03]),.02);       // nostril wings
  d=smin(d,ell(p,[0,.1,.5],[.1,.025,.045]),.02);              // upper lip
  d=smin(d,ell(p,[0,.055,.49],[.09,.028,.045]),.02);          // lower lip
  d=smax(d,-cap(p,[-.085,.078,.535],[.085,.078,.535],.006),.01); // mouth line
  d=smin(d,ell(q,[.44,.32,-.02],[.04,.11,.07]),.04);          // ears
  d=smin(d,cap(p,[0,-.1,-.05],[0,-.7,-.07],.17),.12);         // neck
  d=smin(d,ell(p,[0,-.98,-.06],[1.1,.28,.46]),.22);           // shoulders
  return Math.max(d,-1.1-p[1]);
}
function lap(p){const h=.02,f=sdf;return(f([p[0]+h,p[1],p[2]])+f([p[0]-h,p[1],p[2]])+f([p[0],p[1]+h,p[2]])+f([p[0],p[1]-h,p[2]])+f([p[0],p[1],p[2]+h])+f([p[0],p[1],p[2]-h])-6*f(p))/(h*h)}
function grad(p){const e=.002,f=sdf;return[f([p[0]+e,p[1],p[2]])-f([p[0]-e,p[1],p[2]]),f([p[0],p[1]+e,p[2]])-f([p[0],p[1]-e,p[2]]),f([p[0],p[1],p[2]+e])-f([p[0],p[1],p[2]-e])].map(v=>v/(2*e))}
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
let cachedSurface=null;
function surface(){
  if(cachedSurface)return cachedSurface;
  const r=rng(7),pts=[];let guard=0;
  while(pts.length<11000&&guard++<150000){
    const faceStart=r()<.34;
    let p=faceStart?[(r()*2-1)*.36,r()*.85-.22,.3+r()*.35]:[(r()*2-1)*1.2,r()*2.3-1.1,(r()*2-1)*.75];
    for(let i=0;i<7;i++){const d=sdf(p),g=grad(p),gl=g[0]*g[0]+g[1]*g[1]+g[2]*g[2]||1;p=[p[0]-d*g[0]/gl,p[1]-d*g[1]/gl,p[2]-d*g[2]/gl]}
    const onFace=p[2]>.2&&p[1]>-.25&&p[1]<.62;
    if(r()<(onFace?.35:.7)){p[1]=Math.round(p[1]/.034)*.034;for(let i=0;i<6;i++){const d=sdf(p),g=grad(p),gl=g[0]*g[0]+g[2]*g[2]||1;p=[p[0]-d*g[0]/gl,p[1],p[2]-d*g[2]/gl]}}
    if(Math.abs(sdf(p))>.004||p[1]<-1.09)continue;
    if(p[1]<-.55&&r()>.4)continue;
    if(p[2]<-.2&&p[1]>-.5&&r()>.65)continue;
    const g=grad(p),gl=Math.hypot(...g)||1;p.n=[g[0]/gl,g[1]/gl,g[2]/gl];
    const L=lap(p);const nearEyes=Math.hypot(Math.abs(p[0])-.15,p[1]-.37)<.12;p.feat=Math.min(1,Math.max(0,(L-8)/10)+(nearEyes?0:Math.max(0,(-L-3)/8)))*(p[1]>-.3?1:.3)*(nearEyes?.25:1);
    pts.push(p);
  }
  return cachedSurface=pts;
}


const S=surface();
const cell=.08,grid=new Map(),key=(x,y,z)=>x+','+y+','+z;
S.forEach((p,i)=>{const k=key(Math.floor(p[0]/cell),Math.floor(p[1]/cell),Math.floor(p[2]/cell));(grid.get(k)||grid.set(k,[]).get(k)).push(i)});
const near=(i,maxD,accept)=>{const p=S[i],cx=Math.floor(p[0]/cell),cy=Math.floor(p[1]/cell),cz=Math.floor(p[2]/cell),best=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const j of grid.get(key(cx+dx,cy+dy,cz+dz))||[]){if(j<=i)continue;const q=S[j],d=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);if(d<maxD&&accept(p,q))best.push([d,j])}return best.sort((a,b)=>a[0]-b[0])};
const circuit=[],jay=[];
S.forEach((p,i)=>{if(p[1]>-.62||p[1]<-1.06||p[2]<-.1)return;for(const[,j]of near(i,.1,(a,b)=>Math.abs(a[0]-b[0])<.015||Math.abs(a[1]-b[1])<.015).slice(0,2))circuit.push(i,j)});
S.forEach((p,i)=>{if(p[1]<-.45||i%2)return;for(const[,j]of near(i,.075,()=>true).slice(0,2))jay.push(i,j)});
const N=S.length,c2=circuit.slice(0,6000),j2=jay.slice(0,9000);
const head=new Uint32Array([0x484f4c4f,N,c2.length,j2.length]);
const pos=new Int16Array(N*3),nrm=new Int8Array(N*3),feat=new Uint8Array(N);
S.forEach((p,i)=>{for(let k=0;k<3;k++){pos[i*3+k]=Math.round(p[k]*16000);nrm[i*3+k]=Math.round(p.n[k]*127)}feat[i]=Math.round(p.feat*255)});
const pad=n=>new Uint8Array((4-n%4)%4);
const parts=[head,pos,pad(pos.byteLength),nrm,pad(nrm.byteLength),feat,pad(feat.byteLength),new Uint16Array(c2),pad(c2.length*2),new Uint16Array(j2)];
const buf=Buffer.concat(parts.map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength)));
writeFileSync(new URL('../assets/agent-hologram-surface.bin',import.meta.url),buf);
console.log('points',N,'circuit',c2.length/2,'constellation',j2.length/2,'bytes',buf.length);
