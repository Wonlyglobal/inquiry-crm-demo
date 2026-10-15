import test from 'node:test';import assert from 'node:assert/strict';
import {createPhoneSession,PHONE_TIMING,phoneEnd} from '../assets/agent-phone.mjs';
import {capturePhoneTurn,preparePhoneInput} from '../assets/agent-phone-input.mjs';
import {phoneSpokenReply} from '../supabase/functions/agent-conversation/conversation-style.mjs';
import {validateDialogue,requestBody} from '../supabase/functions/agent-conversation/policy.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
const blocked=signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('stop')),{once:true}));
test('one explicit call runs successive turns serially without a second wake or microphone request',async()=>{
 let prepared=0,released=0,transcribed=0,responded=0,inFlight=0,max=0;const heard=[];
 const p=createPhoneSession({prepare:async()=>{prepared++;return {release:()=>released++}},capture:({signal})=>transcribed<3?Promise.resolve(new Blob(['clip'])):blocked(signal),transcribe:async()=>{transcribed++;return {text:'question '+transcribed,voiceProof:{data:'same-proof'}}},respond:async q=>{max=Math.max(max,++inFlight);heard.push(q);await flush();responded++;inFlight--}});
 try{await p.start();for(let i=0;i<8;i++)await flush();assert.equal(responded,3);assert.equal(max,1);assert.equal(prepared,1);assert.equal(p.snapshot().turns,3);assert.equal(heard[0].voiceProof.data,'same-proof')}finally{p.stop()}assert.equal(released,1);
});
test('interrupt cancels a pending answer and listens again; late answer cannot create overlapping turns',async()=>{
 let captures=0,answers=0,cancel=0;let answerSignal;
 const p=createPhoneSession({prepare:async()=>({release(){}}),capture:({signal})=>++captures===1?Promise.resolve(new Blob(['a'])):blocked(signal),transcribe:async()=>({text:'question'}),respond:async(_,signal)=>{answers++;answerSignal=signal;await blocked(signal)},cancel:()=>cancel++});
 try{await p.start();await flush();assert.equal(p.snapshot().phase,'responding');p.interrupt();await flush();assert.ok(answerSignal.aborted);assert.equal(captures,3);assert.equal(answers,1);assert.equal(p.snapshot().turns,0);assert.equal(cancel,1)}finally{p.stop()}
});
test('mute toggles track and aborts capture; resume starts exactly one listener',async()=>{
 let captures=0,enabled=true;const track={get enabled(){return enabled},set enabled(v){enabled=v}};
 const p=createPhoneSession({prepare:async()=>({stream:{getAudioTracks:()=>[track]},release(){}}),capture:({signal})=>{captures++;return blocked(signal)},transcribe:()=>assert.fail(),respond:()=>assert.fail()});
 try{await p.start();p.setMuted(true);p.setMuted(false);await flush();assert.equal(captures,2);assert.equal(enabled,true);p.setMuted(true);assert.equal(enabled,false);assert.equal(p.snapshot().phase,'muted')}finally{p.stop()}
});
test('hangup during microphone permission request releases late input without capturing',async()=>{
 let finish,releases=0;const p=createPhoneSession({prepare:()=>new Promise(r=>finish=r),capture:()=>assert.fail(),transcribe:()=>assert.fail(),respond:()=>assert.fail()});const pending=p.start();p.stop();finish({release:()=>releases++});await pending;assert.equal(releases,1);assert.equal(p.isActive(),false);
});
test('silence never transcribes; voiceprint rejection is not answered; verified hangup ends call',async()=>{
 let time=0,transcribes=0;const p=createPhoneSession({now:()=>time,maxIdleMs:100,prepare:async()=>({release(){}}),capture:async()=>{time=200;return null},transcribe:()=>assert.fail(),respond:()=>assert.fail()});await p.start();await flush();assert.equal(p.isActive(),false);
 const q=createPhoneSession({prepare:async()=>({release(){}}),capture:async()=>new Blob(['a']),transcribe:async()=>++transcribes===1?{ignored:'other',text:'private'}:{text:'挂断电话'},respond:()=>assert.fail()});await q.start();await flush();assert.equal(q.isActive(),false);assert.equal(transcribes,2);assert.equal(phoneEnd('结束通话'),true);assert.equal(phoneEnd('Grace，挂断电话吧'),true);assert.equal(phoneEnd('讲解挂断电话的方法'),false);
});
test('network errors stop instead of reconnecting or uploading in the background',async()=>{
 let calls=0,release=0;const p=createPhoneSession({prepare:async()=>({release:()=>release++}),capture:async()=>new Blob(['a']),transcribe:async()=>{calls++;throw Error('network failure')},respond:()=>assert.fail()});await p.start();await flush();assert.equal(calls,1);assert.equal(release,1);assert.equal(p.isActive(),false);
});
test('PCM capture keeps valid pre-roll, returns a bounded WAV and does not close the call microphone',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});let processor,closed=0,stopped=0,time=0;
 const context={sampleRate:16000,state:'running',destination:{},close:()=>closed++,createMediaStreamSource:()=>({connect(){},disconnect(){}}),createGain:()=>({gain:{},connect(){},disconnect(){}}),createScriptProcessor:()=>processor={connect(){},disconnect(){}}};
 const input={context,stream:{getTracks:()=>[{stop:()=>stopped++}]}};
 const p=capturePhoneTurn({signal:new AbortController().signal,input,timing:PHONE_TIMING,now:()=>time});
 const frame=level=>{time+=64;processor.onaudioprocess?.({inputBuffer:{getChannelData:()=>new Float32Array(1024).fill(level)}})};
 for(let i=0;i<100;i++)frame(0);for(let i=0;i<5;i++)frame(.1);for(let i=0;i<13;i++)frame(0);
 const blob=await p;assert.equal(blob.type,'audio/wav');assert.ok(blob.size<60000);const header=new TextDecoder().decode((await blob.arrayBuffer()).slice(0,12));assert.equal(header.slice(0,4),'RIFF');assert.equal(closed,0);assert.equal(stopped,0);assert.equal(processor.onaudioprocess,null);
});
test('PCM silence and aborted turn return no upload; late microphone permission releases all resources',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let stopped=0,closed=0,permission;
 class C{state='running';resume(){return Promise.resolve()}close(){closed++;return Promise.resolve()}}
 const c=new AbortController();const p=preparePhoneInput({Context:C,signal:c.signal,mediaDevices:{getUserMedia:()=>new Promise(r=>permission=r)}});await Promise.resolve();c.abort();permission({getTracks:()=>[{stop:()=>stopped++}],getAudioTracks:()=>[]});await assert.rejects(p,/停止/);assert.equal(stopped,1);assert.equal(closed,1);
});
test('phone mode cannot bypass voice policy and keeps speech short',()=>{
 const q={action:'chat',persona:'Grace',question:'公开渠道分析',history:[],voice:true,phone:true};assert.doesNotThrow(()=>validateDialogue(q));assert.throws(()=>validateDialogue({...q,voice:false}),/通话/);assert.throws(()=>validateDialogue({...q,phone:'true'}),/通话/);assert.equal(requestBody(q,'qwen-plus','PUBLIC').max_tokens,1400);assert.match(requestBody(q,'qwen-plus','PUBLIC').messages[0].content,/连续电话/);assert.ok(phoneSpokenReply('内容'.repeat(150)).length<=140);
});
test('maximum call timer releases input and cancels capture',async t=>{
 t.mock.timers.enable({apis:['setInterval','setTimeout','Date']});let release=0;const p=createPhoneSession({maxMs:1000,prepare:async()=>({release:()=>release++}),capture:({signal})=>blocked(signal),transcribe:()=>assert.fail(),respond:()=>assert.fail()});await p.start();t.mock.timers.tick(1000);await Promise.resolve();assert.equal(p.isActive(),false);assert.equal(release,1);
});
test('source retains voiceprint gate and private material speech boundary in phone mode',async()=>{
 const {readFileSync}=await import('node:fs');const src=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');const ui=readFileSync(new URL('../assets/agent-conversation.mjs',import.meta.url),'utf8');
 assert.ok(src.indexOf("VOICEPRINT_ENABLED')==='1'")<src.indexOf('const v9Turn='));assert.match(src,/materialSpokenReply\(materials\)/);assert.match(src,/if\(!guest&&!route.materials&&input.phone!==true\)\{qEmbedding=await embed/);assert.match(src,/memory_mode='recent_turns_only'/);assert.match(ui,/voiceProof:heard.voiceProof/);assert.match(ui,/phoneSignal\?\.removeEventListener\('abort',abortPhoneTurn\)/);
});
test('hangup before audio resume never requests a microphone',async()=>{
 let resume,requests=0,closed=0;class C{state='running';resume(){return new Promise(r=>resume=r)}close(){closed++;return Promise.resolve()}}
 const c=new AbortController();const p=preparePhoneInput({Context:C,signal:c.signal,mediaDevices:{getUserMedia(){requests++;throw Error('unexpected')}}});c.abort();resume();await assert.rejects(p,/停止/);assert.equal(requests,0);assert.equal(closed,1);
});
test('unavailable speaker verification ends call without answering or retrying',async()=>{
 let captures=0,transcribes=0,monitorSignal;const p=createPhoneSession({prepare:async()=>({release(){}}),capture:({monitor,signal})=>{if(monitor){monitorSignal=signal;return blocked(signal)}captures++;return Promise.resolve(new Blob(['a']))},transcribe:async()=>{transcribes++;return {ignored:'unavailable'}},respond:()=>assert.fail()});await p.start();await flush();assert.equal(p.isActive(),false);assert.equal(captures,1);assert.equal(transcribes,1);assert.equal(monitorSignal.aborted,true);
});

test('automatic barge-in cancels speech immediately but reuses the already recording clip and speaker proof',async()=>{
 let captures=0,release=0,startSpeech,finishClip,oldSignal,second,resolveOld;const clips=[],answers=[];
 const p=createPhoneSession({prepare:async()=>({release:()=>release++}),capture:({signal,onSpeechStart})=>{
  captures++;if(captures===1)return Promise.resolve(new Blob(['first']));if(captures===2){startSpeech=onSpeechStart;return new Promise(r=>finishClip=r)}return blocked(signal);
 },transcribe:async blob=>{const text=await blob.text();clips.push(text);return {text,voiceProof:{data:'verified-'+text}}},respond:(heard,signal)=>{
  answers.push(heard);if(answers.length===1){oldSignal=signal;p.markSpeaking(50);return new Promise(r=>resolveOld=r)}second=heard;return Promise.resolve();
 }});
 try{await p.start();await flush();assert.equal(captures,2);assert.equal(p.snapshot().phase,'speaking');startSpeech();await flush();assert.ok(oldSignal.aborted);assert.equal(p.snapshot().phase,'listening');assert.equal(captures,2);assert.equal(clips.length,1);finishClip(new Blob(['onset and whole followup']));await flush();await flush();assert.equal(second.text,'onset and whole followup');assert.equal(second.voiceProof.data,'verified-onset and whole followup');assert.equal(p.snapshot().interruptions,1);assert.equal(p.snapshot().turns,1);resolveOld();await flush();assert.equal(p.snapshot().turns,1)}finally{p.stop()}assert.equal(release,1);
});
test('next speech after a completed response is not counted as interruption; mute tears down the overlap listener',async()=>{
 let captures=0,next,onStart;const p=createPhoneSession({prepare:async()=>({release(){}}),capture:({signal,onSpeechStart})=>{if(++captures===1)return Promise.resolve(new Blob(['a']));onStart=onSpeechStart;return new Promise((resolve,reject)=>{next=resolve;signal.addEventListener('abort',()=>reject(Error('stop')),{once:true})})},transcribe:async()=>({text:'question'}),respond:async()=>{}});
 try{await p.start();await flush();assert.equal(p.snapshot().turns,1);onStart();assert.equal(p.snapshot().interruptions,0);p.setMuted(true);p.setMuted(false);await flush();assert.equal(captures,3);next(null)}finally{p.stop()}
});

function pcmHarness({playback=null,echo=null,monitor=true}={}){
 let processor,time=0,starts=0,encoded;const abort=new AbortController();
 const context={sampleRate:16000,state:'running',destination:{},createMediaStreamSource:()=>({connect(){},disconnect(){}}),createGain:()=>({gain:{},connect(){},disconnect(){}}),createScriptProcessor:()=>processor={connect(){},disconnect(){}}};
 const input={context,stream:{},playback,echo};
 const promise=capturePhoneTurn({input,signal:abort.signal,timing:PHONE_TIMING,monitor,now:()=>time,onSpeechStart:()=>starts++,encode:samples=>{encoded=samples;return new Blob(['valid clip'])}});
 const frame=value=>{time+=64;processor.onaudioprocess?.({inputBuffer:{getChannelData:()=>typeof value==='number'?new Float32Array(1024).fill(value):value}})};
 return {promise,frame,abort,get starts(){return starts},get samples(){return encoded},get time(){return time}};
}
test('obvious speaker echo and isolated clicks never interrupt or become an upload',async()=>{
 let ducks=0;const h=pcmHarness({playback:{active:true,supported:true,duck:()=>ducks++,restore(){}},echo:{matches:()=>true}});
 for(let i=0;i<300;i++)h.frame(.1);assert.equal(h.starts,0);assert.equal(ducks,0);h.abort.abort();await assert.rejects(h.promise,/停止/);
 const click=pcmHarness();click.frame(.5);for(let i=0;i<20;i++)click.frame(0);assert.equal(click.starts,0);click.abort.abort();await assert.rejects(click.promise);
});
test('residual echo probe restores playback without interrupting when sound stops after duck',async()=>{
 let ducked=false,restores=0;const h=pcmHarness({playback:{active:true,supported:true,duck:()=>ducked=true,restore:()=>{ducked=false;restores++}},echo:{matches:()=>false}});
 for(let i=0;i<3;i++)h.frame(.08);assert.equal(ducked,true);for(let i=0;i<6;i++)h.frame(0);assert.equal(restores,1);assert.equal(h.starts,0);h.abort.abort();await assert.rejects(h.promise);
});
test('sustained overlapping speech confirms within half a second and preserves onset in one bounded clip',async()=>{
 let ducked=false;const h=pcmHarness({playback:{active:true,supported:true,duck:()=>ducked=true,restore:()=>ducked=false},echo:{matches:()=>false}});
 h.frame(0);for(let i=0;i<8;i++)h.frame(.08);assert.equal(h.starts,1);assert.equal(ducked,false);for(let i=0;i<10;i++)h.frame(0);await h.promise;assert.ok(h.samples.length<16000*2);assert.equal(h.samples[1024],Math.fround(.08));assert.ok(h.time<1500);
});
test('unsupported playback reference fails closed for automatic barge-in; silence is bounded and abortable',async()=>{
 const h=pcmHarness({playback:{active:true,supported:false}});for(let i=0;i<30;i++)h.frame(.2);assert.equal(h.starts,0);h.abort.abort();await assert.rejects(h.promise);
});
test('playback reference rejects scaled delayed echo but permits a different simultaneous signal',async()=>{
 const {createEchoReference}=await import('../assets/agent-phone-echo.mjs');for(const rate of [16000,48000]){
  const echo=createEchoReference(rate),signal=Float32Array.from({length:Math.round(rate*.4)},(_,i)=>.1*Math.sin(i/rate*2*Math.PI*431)+.07*Math.sin(i/rate*2*Math.PI*937));echo.push(signal);
  const tail=signal.slice(Math.round(rate*.16),Math.round(rate*.16)+1024).map(x=>x*.45);assert.equal(echo.matches(tail),true);
  const user=Float32Array.from({length:1024},(_,i)=>.12*Math.sin(i/rate*2*Math.PI*277)+.09*Math.sin(i/rate*2*Math.PI*1409)+tail[i]);assert.equal(echo.matches(user),false);echo.clear();assert.equal(echo.matches(tail),false);
 }
});
test('input playback graph restores or releases its gain and reference nodes without reopening microphone',async()=>{
 let reference,closed=0,tracks=0;const gains=[];class C{sampleRate=16000;state='running';destination={};resume(){return Promise.resolve()}close(){closed++;return Promise.resolve()}createGain(){const node={gain:{value:1},connect(){},disconnect(){}};gains.push(node);return node}createScriptProcessor(){return reference={connect(){},disconnect(){}}}createMediaElementSource(){return {connect(){},disconnect(){}}}}
 const input=await preparePhoneInput({Context:C,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>tracks++}],getAudioTracks:()=>[]})}});const audio={paused:false,ended:false};const playback=input.attachPlayback(audio);assert.equal(playback.supported,true);playback.duck();assert.equal(gains[0].gain.value,0);playback.restore();assert.equal(gains[0].gain.value,1);input.release();input.release();assert.equal(reference.onaudioprocess,null);assert.equal(closed,1);assert.equal(tracks,1);
});
test('an overlapping listener failure stops playback instead of pretending the call can hear',async()=>{
 let captures=0,signal,released=0;const p=createPhoneSession({prepare:async()=>({release:()=>released++}),capture:async()=>{if(++captures===1)return new Blob(['a']);throw Error('listener failed')},transcribe:async()=>({text:'question'}),respond:async(_,s)=>{signal=s;await blocked(s)}});await p.start();await flush();assert.equal(p.isActive(),false);assert.equal(signal.aborted,true);assert.equal(released,1);
});
test('idle timeout still stops the open-ended overlap listener after a completed response',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});let captures=0,released=0;const p=createPhoneSession({maxIdleMs:1000,prepare:async()=>({release:()=>released++}),capture:({signal})=>++captures===1?Promise.resolve(new Blob(['a'])):blocked(signal),transcribe:async()=>({text:'question'}),respond:async()=>{}});await p.start();await flush();assert.equal(p.snapshot().turns,1);t.mock.timers.tick(1000);await flush();assert.equal(p.isActive(),false);assert.equal(released,1);
});

test('speech while ASR is pending queues locally and cannot repeatedly cancel the first answer',async()=>{
 let captures=0,transcribes=0,startSpeech,finishClip,oldSignal,finishOld;const answers=[];
 const p=createPhoneSession({prepare:async()=>({release(){}}),capture:({signal,onSpeechStart})=>{if(++captures===1)return Promise.resolve(new Blob(['first']));if(captures===2){startSpeech=onSpeechStart;return new Promise(r=>finishClip=r)}return blocked(signal)},transcribe:async(blob,signal)=>{if(++transcribes===1){oldSignal=signal;return new Promise(r=>finishOld=r)}return {text:await blob.text()}},respond:async heard=>answers.push(heard.text)});
 try{await p.start();await flush();assert.equal(p.snapshot().phase,'transcribing');assert.equal(startSpeech(),false);finishClip(new Blob(['followup onset retained']));await flush();assert.equal(oldSignal.aborted,false);assert.deepEqual(answers,[]);finishOld({text:'first question'});await flush();await flush();assert.deepEqual(answers,['first question','followup onset retained']);assert.equal(p.snapshot().interruptions,0)}finally{p.stop()}
});
test('waiting listener learns continuous room noise, ends on that noise and never streams a queued clip',async()=>{
 let processor,time=0,starts=0,frames=0,ended=0;const controller=new AbortController();
 const context={sampleRate:16000,state:'running',destination:{},createMediaStreamSource:()=>({connect(){},disconnect(){}}),createGain:()=>({gain:{},connect(){},disconnect(){}}),createScriptProcessor:()=>processor={connect(){},disconnect(){}}};
 const promise=capturePhoneTurn({input:{context,stream:{}},signal:controller.signal,timing:PHONE_TIMING,monitor:true,now:()=>time,onSpeechStart:()=>{starts++;return false},onPcm:()=>frames++,onAudioEnd:()=>ended++,encode:()=>new Blob(['queued'])});
 const frame=level=>{time+=64;processor.onaudioprocess?.({inputBuffer:{getChannelData:()=>new Float32Array(1024).fill(level)}})};
 for(let i=0;i<50;i++)frame(.025);assert.equal(starts,0);for(let i=0;i<6;i++)frame(.12);for(let i=0;i<12;i++)frame(.025);
 assert.equal((await promise).size,6);assert.equal(starts,1);assert.equal(frames,0);assert.equal(ended,0);
});
test('back-to-back automatic interruptions cannot starve every answer',async()=>{
 let captures=0,startSpeech,finishClip,finishAnswer,currentSignal;const p=createPhoneSession({prepare:async()=>({release(){}}),capture:({signal,onSpeechStart})=>{if(++captures===1)return Promise.resolve(new Blob(['first']));startSpeech=onSpeechStart;return new Promise((resolve,reject)=>{finishClip=resolve;signal.addEventListener('abort',()=>reject(Error('stop')),{once:true})})},transcribe:async()=>({text:'question'}),respond:async(_,signal)=>{currentSignal=signal;p.markSpeaking(10);await new Promise(r=>finishAnswer=r)}});
 try{await p.start();await flush();for(let i=0;i<2;i++){assert.equal(startSpeech(),true);finishClip(new Blob(['followup']));await flush();await flush()}assert.equal(p.snapshot().interruptions,2);assert.equal(startSpeech(),false);assert.equal(currentSignal.aborted,false);assert.equal(p.snapshot().automaticBargeIn,false);finishAnswer();await flush();assert.equal(p.snapshot().turns,1);assert.equal(p.isActive(),true)}finally{p.stop()}
});

test('steady background above the old fixed threshold neither starts nor holds open the first question',async()=>{
 const h=pcmHarness({monitor:false});for(let i=0;i<40;i++)h.frame(.025);assert.equal(h.starts,0);for(let i=0;i<8;i++)h.frame(.12);for(let i=0;i<12;i++)h.frame(.025);await h.promise;assert.equal(h.starts,1);assert.ok(h.samples.length<16000*3);
});

test('a quiet fan starting after calibration cannot hold a spoken question open for 45 seconds',async()=>{
 const h=pcmHarness({monitor:false});for(let i=0;i<8;i++)h.frame(0);for(let i=0;i<4;i++)h.frame(.025);for(let i=0;i<8;i++)h.frame(.12);for(let i=0;i<30;i++)h.frame(.025);await h.promise;assert.equal(h.starts,1);assert.ok(h.samples.length<16000*5);
});
