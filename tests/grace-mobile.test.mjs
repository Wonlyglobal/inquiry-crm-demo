import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWav,createCompatibleRecorder,audioExtension} from '../assets/grace-recorder.mjs';
import {orbState} from '../assets/grace-mobile.mjs';
import {readFileSync} from 'node:fs';
test('six states are distinct and loss of network overrides speaking',()=>{
 assert.equal(new Set(['idle','listening','thinking','speaking','interrupt','offline'].map(s=>orbState(s))).size,6);
 assert.equal(orbState('speaking',false),'offline');
});
test('PCM fallback is mono 16kHz WAV within server limit for one minute',async()=>{
 const pcm=new Float32Array(48000*60);pcm.fill(.5);
 const blob=encodeWav(pcm,48000),view=new DataView(await blob.arrayBuffer());
 assert.equal(blob.type,'audio/wav');assert.equal(blob.size,1920044);assert.ok(blob.size<2500000);
 assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(22,true),1);
 assert.equal(view.getInt16(44,true),16383);assert.equal(view.getUint32(40,true),1920000);
 assert.equal(audioExtension(blob.type),'wav');
});
test('supported WebM uses existing MediaRecorder path',async()=>{
 class Recorder {static isTypeSupported(t){return t.includes('webm')}constructor(stream,options){this.stream=stream;this.options=options}}
 const stream={};const recorder=await createCompatibleRecorder(stream,{Recorder});assert.equal(recorder.stream,stream);assert.equal(recorder.options.mimeType,'audio/webm;codecs=opus');
});
test('WAV recorder stops once, releases audio graph, and emits final clip before stop',async()=>{
 let context;class Context {constructor(){context=this;this.state='running';this.sampleRate=48000;this.disconnected=0}async resume(){}async close(){this.closed=true}node(){return {connect(){},disconnect:()=>this.disconnected++}}createMediaStreamSource(){return this.node()}createScriptProcessor(){return this.processor=this.node()}createGain(){return {...this.node(),gain:{value:1}}}}
 const rec=await createCompatibleRecorder({}, {Recorder:null,Context}),events=[];
 rec.ondataavailable=e=>events.push(e.data.type);rec.onstop=()=>events.push('stop');
 rec.start();context.processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(4096)}});rec.stop();rec.stop();await Promise.resolve();
 assert.deepEqual(events,['audio/wav','stop']);assert.equal(context.disconnected,3);assert.equal(context.closed,true);
});
test('mobile presentation does not introduce an independent AI endpoint or bypass authorization',()=>{
 const source=readFileSync(new URL('../assets/grace-mobile.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fetch\(|api[_-]?key|Authorization|supabase\.co/);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/if\(window.CRM_EMBED\|\|!canUseAgentWorld\(profile,currentAuthUser\)\)return;\s*if\(isGraceApp\(\)\)/);
});
