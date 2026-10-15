import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRealtimeBridge} from '../supabase/functions/agent-realtime/bridge.mjs';
import {nativeConversation,sessionUpdate,toBase64,pcmWav,fromBase64,realtimeUrl,confirmedSession,diagnosticPcm} from '../supabase/functions/agent-realtime/policy.mjs';
import {createRealtimeClient} from '../assets/agent-realtime-client.mjs';
import {pcmEncoder,encodePcm,createPcmPlayer} from '../assets/agent-realtime-audio.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const config={turn_detection:null,audio:{input:{format:{type:'pcm',sample_rate:16000}},output:{format:{sample_rate:24000,type:'pcm'}}}};
function bridgeHarness({verify=async()=> 'owner',authorizeTurn=async()=>{},history=[]}={}){
 const out=[],up=[],verified=[],errors=[];let ws,time=100000;
 const b=createRealtimeBridge({send:e=>out.push(e),verify:async a=>{verified.push(a);return verify(a)},authorizeTurn,proof:async()=>({data:'signed',signature:'proof'}),history,now:()=>time,openProvider:()=>{ws={readyState:1,bufferedAmount:0,send:e=>up.push(JSON.parse(e)),close(){this.readyState=3}};queueMicrotask(()=>ws.onopen());return ws},onError:e=>errors.push(e)});
 const event=async e=>{ws.onmessage({data:JSON.stringify(e)});await tick()};
 return {b,out,up,errors,verified,event,advance(ms){time+=ms},async begin(){const task=b.begin(1);await tick();await event({type:'session.updated',session:config});await task},append(n=3200){b.append({turn:1,seq:up.filter(x=>x.type==='input_audio_buffer.append').length+1,audio:toBase64(new Uint8Array(n))})}};
}
const appendFrames=(h,n=64000)=>{for(let i=0,seq=1;i<n;i+=3200,seq++)h.b.append({turn:1,seq,audio:toBase64(new Uint8Array(Math.min(3200,n-i)))})};
test('native routing keeps products, CRM, followups, fresh and sensitive input on existing path',()=>{
 for(const q of ['给我X60 Pro参数','X六零','爱克斯六零','智能锁画册v9','我们的询盘','今天天气','谢谢，请查下网站','继续','那它的价格呢','帮我打开公司背调','记住我喜欢简洁'])assert.equal(nativeConversation(q,'X60 Pro参数'),false,q);
 assert.throws(()=>nativeConversation('密码：abcDEF123!'));assert.equal(nativeConversation('谢谢你'),true);assert.equal(nativeConversation('讲一个简短的笑话'),true);
 assert.throws(()=>realtimeUrl('https://evil.invalid'));assert.match(realtimeUrl('ws-example'),/^wss:\/\/ws-example.cn-beijing.maas.aliyuncs.com/);
 assert.equal(sessionUpdate().session.turn_detection,null);
});
test('no cloud audio until configuration and internal voiceprint finish',async()=>{
 const gate=deferred(),h=bridgeHarness({verify:()=>gate.promise});await h.begin();appendFrames(h);
 await tick();assert.equal(h.verified.length,1);assert.equal(h.up.filter(e=>e.type==='input_audio_buffer.append').length,0);
 assert.equal(new DataView(h.verified[0].buffer).getUint32(24,true),16000);gate.resolve('owner');await tick();assert.equal(h.up.filter(e=>e.type==='input_audio_buffer.append').length,1);h.b.close();
});
test('unknown speaker is ignored before cloud transcription or answer',async()=>{
 for(const speaker of ['other','uncertain','unavailable']){const h=bridgeHarness({verify:async()=>speaker});await h.begin();h.append();h.b.commit(1);await tick();assert.equal(h.up.some(e=>e.type.startsWith('input_audio_buffer.')),false);assert.equal(h.out.at(-1).ignored,speaker);h.b.close()}
});
test('manual PCM configuration is mandatory; unsolicited provider output is dropped',async()=>{
 const h=bridgeHarness();const task=h.b.begin(1);await tick();await h.event({type:'session.updated',session:{...config,turn_detection:{type:'server_vad'}}});await task;assert.equal(h.errors.length,1);assert.equal(h.out.some(e=>e.type==='turn.ready'),false);h.b.close();
 const good=bridgeHarness();await good.begin();await good.event({type:'response.audio.delta',delta:toBase64(new Uint8Array(10))});assert.equal(good.out.some(e=>e.type==='audio'),false);good.b.close();
});
test('internal product transcription delegates with signed proof and never creates native response',async()=>{
 const h=bridgeHarness();await h.begin();h.append();h.b.commit(1);await tick();await h.event({type:'conversation.item.input_audio_transcription.completed',transcript:'给我X60 Pro产品参数'});
 const t=h.out.find(e=>e.type==='transcript');assert.equal(t.native,false);assert.equal(t.voiceProof.signature,'proof');assert.throws(()=>h.b.respond(1));assert.equal(h.up.some(e=>e.type==='response.create'),false);assert.deepEqual(h.b.state().history,[]);h.b.close();
});
test('native streams first audio before completion and remembers only fully heard answers',async()=>{
 const h=bridgeHarness();await h.begin();h.append();h.b.commit(1);await tick();await h.event({type:'conversation.item.input_audio_transcription.completed',transcript:'谢谢你'});h.b.respond(1);
 await h.event({type:'response.audio.delta',delta:toBase64(new Uint8Array(100))});assert.equal(h.out.at(-1).type,'audio');assert.deepEqual(h.b.state().history,[]);
 await h.event({type:'response.audio_transcript.delta',delta:'随时为你效劳。'});await h.event({type:'response.done',response:{status:'completed'}});assert.deepEqual(h.b.state().history,[]);h.b.heard(1);assert.equal(h.b.state().history.at(-1).content,'随时为你效劳。');h.b.close();
});
test('cancel stops provider generation, discards late deltas and keeps next turn serial',async()=>{
 const h=bridgeHarness();await h.begin();h.append();h.b.commit(1);await tick();await h.event({type:'conversation.item.input_audio_transcription.completed',transcript:'讲个笑话'});h.b.respond(1);h.b.cancel(1);assert.equal(h.up.at(-1).type,'response.cancel');await h.event({type:'response.audio.delta',delta:toBase64(new Uint8Array(100))});assert.equal(h.out.some(e=>e.type==='audio'),false);assert.deepEqual(h.b.state().history,[]);assert.equal(h.b.state().lastTurn,1);h.b.close();
});
test('frames are bounded, ordered, wall-clock paced and speaker consistent',async()=>{
 const h=bridgeHarness();await h.begin();assert.throws(()=>h.b.append({turn:1,seq:2,audio:toBase64(new Uint8Array(100))}));assert.throws(()=>h.b.append({turn:1,seq:1,audio:toBase64(new Uint8Array(6402))}));h.b.close();
 let n=0;const mixed=bridgeHarness({verify:async()=>++n===1?'owner':'not_enrolled'});await mixed.begin();appendFrames(mixed);await tick();mixed.advance(2000);for(let seq=21;seq<=40;seq++)mixed.b.append({turn:1,seq,audio:toBase64(new Uint8Array(3200))});await tick();assert.equal(mixed.out.at(-1).ignored,'not_enrolled');assert.equal(mixed.up.filter(e=>e.type==='input_audio_buffer.append').length,1);mixed.b.close();
});
test('PCM codec preserves chunked resampling and WAV boundaries',()=>{
 const src=Float32Array.from({length:4800},(_,i)=>Math.sin(i*.05)*.6),whole=pcmEncoder(48000)(src),encode=pcmEncoder(48000),chunks=[];for(let i=0;i<src.length;i+=137)chunks.push(encode(src.slice(i,i+137)));assert.deepEqual(Buffer.concat(chunks),Buffer.from(whole));assert.equal(whole.length,3200);assert.deepEqual(fromBase64(encodePcm(whole),6400),whole);assert.equal(pcmWav(whole).length,whole.length+44);assert.throws(()=>fromBase64('garbage!',6400));assert.throws(()=>pcmEncoder(1));
});
function clientHarness(){
 const sockets=[],failures=[],played=[];let getTokens=0,activePlayer;
 class Socket{constructor(url){this.url=url;this.readyState=0;this.bufferedAmount=0;this.sent=[];sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}send(d){this.sent.push(JSON.parse(d))}close(){this.readyState=3;this.onclose?.()}event(d){this.onmessage({data:JSON.stringify(d)})}}
 const c=createRealtimeClient({url:'wss://crm.invalid/agent-realtime',getToken:async()=>{getTokens++;return 'session-token'},Socket,onFailure:e=>failures.push(e),playerFactory:(_,{onStart})=>{const done=deferred();activePlayer={push(bytes){played.push(bytes);onStart()},finish(){return done.promise},stop(){done.resolve()}};return activePlayer}});
 return {c,sockets,played,failures,getTokens:()=>getTokens,async open(){const task=c.open({},{signal:new AbortController().signal});await tick();sockets[0].event({type:'ready',lastTurn:0});await task},drain(){activePlayer.finish=async()=>{}}};
}
test('client authenticates in first frame, streams before capture ends, plays before done',async()=>{
 const h=clientHarness();await h.open();const s=h.sockets[0];assert.equal(s.url.includes('token'),false);assert.deepEqual(s.sent[0],{type:'auth',token:'session-token'});
 const f=h.c.createFeed();f.push(new Float32Array(1024),48000);assert.equal(s.sent.at(-1).type,'turn.start');s.event({type:'turn.ready',turn:1});assert.equal(s.sent.at(-1).type,'audio.append');f.end();assert.equal(s.sent.at(-1).type,'audio.commit');s.event({type:'transcript',turn:1,text:'你好',native:true,voiceProof:{}});const heard=await f.heard;let started=0;const responding=h.c.respond(heard.realtimeTurn,new AbortController().signal,()=>started++);s.event({type:'audio',turn:1,audio:toBase64(new Uint8Array(100)),sampleRate:24000});assert.equal(started,1);assert.equal(h.played.length,1);h.drain();s.event({type:'done',turn:1,answer:'你好。'});assert.equal(await responding,'你好。');assert.equal(s.sent.at(-1).type,'response.heard');h.c.close();
});
test('client cancels old turn without reusing counter or playing late audio',async()=>{
 const h=clientHarness();await h.open();const s=h.sockets[0],f=h.c.createFeed();f.push(new Float32Array(1024),48000);f.cancel();const next=h.c.createFeed();assert.equal(next.id,2);s.event({type:'audio',turn:1,audio:toBase64(new Uint8Array(10)),sampleRate:24000});assert.equal(h.played.length,0);assert.equal(h.failures.length,0);next.cancel();h.c.close();
});
test('server-directed rotation preserves unsent onset and resumes with a fresh session token',async()=>{
 const h=clientHarness();await h.open();const a=h.sockets[0],f=h.c.createFeed();f.push(new Float32Array(1024).fill(.2),48000);a.event({type:'rotate',resume:{data:'signed-state',signature:'sig'}});await tick();const b=h.sockets[1];assert.equal(b.sent[0].resume.data,'signed-state');b.event({type:'ready',lastTurn:0});b.event({type:'turn.ready',turn:1});assert.equal(b.sent.filter(e=>e.type==='audio.append').length,1);assert.equal(b.sent.find(e=>e.type==='audio.append').seq,1);assert.equal(h.getTokens(),2);f.cancel();h.c.close();
});

test('fractional-rate streaming resampling matches one buffer at every supported device rate',()=>{
 for(const rate of [8000,16000,22050,24000,44100,48000,96000,192000]){const source=Float32Array.from({length:rate/10},(_,i)=>Math.sin(i*.2)*.7),full=pcmEncoder(rate)(source),encode=pcmEncoder(rate),parts=[];for(let i=0;i<source.length;i+=1024)parts.push(encode(source.slice(i,i+1024)));assert.equal(full.length,3200);assert.deepEqual(Buffer.concat(parts),Buffer.from(full),String(rate))}
});

test('provider optional null VAD echo stays gated by exact PCM; active or malformed VAD is rejected',()=>{
 assert.equal(confirmedSession(config),true);const omitted=structuredClone(config);delete omitted.turn_detection;assert.equal(confirmedSession(omitted),true);for(const vad of [false,true,{}, {type:'server_vad'}, {type:'semantic_vad'}])assert.equal(confirmedSession({...config,turn_detection:vad}),false);assert.equal(confirmedSession({output_audio_format:'pcm'}),false);assert.equal(confirmedSession({...config,audio:{...config.audio,output:{format:{type:'wav',sample_rate:24000}}}}),false);
 const diagnostic=diagnosticPcm([new Uint8Array(48000)]);assert.equal(diagnostic.length,64000);assert.deepEqual(diagnostic.slice(-32000),new Uint8Array(32000));assert.throws(()=>diagnosticPcm([new Uint8Array(200002)]));
});

test('real diagnostic checks internal speaker readiness without recording or publishing a voice template',async()=>{
 const {readFile}=await import('node:fs/promises'),src=await readFile(new URL('../supabase/functions/agent-realtime/index.ts',import.meta.url),'utf8'),probe=src.slice(src.indexOf('async function probe'),src.indexOf('Deno.serve'));assert.match(probe,/op:'status'/);assert.match(probe,/if\(vp.status!=='ok'\)throw/);assert.match(probe,/voiceprint_available:true/);assert.doesNotMatch(probe,/embedding|op:'enroll'|op:'delete'/);
});
