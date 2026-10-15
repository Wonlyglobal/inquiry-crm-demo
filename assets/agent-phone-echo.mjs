// Local playback reference only. Bounded RAM, no recording, network or identity decisions.
// Correlation rejects obvious delayed speaker echo; duck-and-confirm handles residual echo.
export function createEchoReference(sampleRate){
 const stride=Math.max(1,Math.round(sampleRate/8000)),limit=Math.ceil(sampleRate/stride*.45);
 let reference=new Float32Array(0);
 const downsample=frame=>{const out=new Float32Array(Math.ceil(frame.length/stride));for(let i=0,j=0;i<frame.length;i+=stride)out[j++]=frame[i];return out};
 return {
  clear(){reference=new Float32Array(0)},
  push(frame){const next=downsample(frame),keep=Math.min(reference.length,Math.max(0,limit-next.length));const out=new Float32Array(keep+next.length);out.set(reference.subarray(reference.length-keep));out.set(next,keep);reference=out},
  matches(frame){
   const mic=downsample(frame);let energy=0;for(const x of mic)energy+=x*x;if(energy<1e-8||reference.length<mic.length)return false;
   let best=0,bestAt=0;
   const score=offset=>{let dot=0,refEnergy=0;for(let i=0;i<mic.length;i++){const x=reference[offset+i];dot+=x*mic[i];refEnergy+=x*x}return refEnergy>1e-7?dot*dot/(energy*refEnergy):0};
   for(let at=0;at<=reference.length-mic.length;at+=4){const s=score(at);if(s>best){best=s;bestAt=at}}
   for(let at=Math.max(0,bestAt-3);at<=Math.min(reference.length-mic.length,bestAt+3);at++)best=Math.max(best,score(at));
   return best>.72*.72;
  }
 };
}
