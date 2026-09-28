import test from 'node:test';import assert from 'node:assert/strict';
import {mountLobbyBrief} from '../assets/agent-intelligence.mjs';
class El{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.textContent='';this.value='';this.hidden=false}append(...n){this.children.push(...n);if(this.tag==='select'&&!this.init&&n[0]){this.value=n[0].value;this.init=true}}setAttribute(k,v){this.attrs[k]=v}addEventListener(k,f){this['on'+k]=f}}
function setup(allowed=true){
 const created=[];globalThis.document={createElement:t=>{const e=new El(t);created.push(e);return e}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>assert.fail('lobby brief must not open the microphone')}}});
 const calls=[];const host=new El('section');let ok=allowed;
 const api=mountLobbyBrief(host,{isAllowed:()=>ok,brief:(p,period)=>{calls.push([p,period]);return `${p} · 自动信息简报 ${period||'当前'}`},now:()=>new Date('2026-09-28T01:00:00Z')});
 const pre=created.find(e=>e.tag==='pre'),buttons=created.filter(e=>e.tag==='button'),select=created.find(e=>e.tag==='select');
 return {api,pre,buttons,select,calls,deny:()=>ok=false,host};
}
test('lobby brief renders Jay by default with a machine-readable timestamp and no microphone',()=>{
 const s=setup();assert.equal(s.pre.id,'lobby-brief-text');assert.match(s.pre.textContent,/^Jay · 自动信息简报/);
 assert.equal(s.pre.dataset.generatedAt,'2026-09-28T01:00:00.000Z');assert.equal(s.pre.dataset.period,'current');
});
test('persona and period switches pass through; last week uses the dated filter',()=>{
 const s=setup();s.buttons.find(b=>b.dataset.briefPersona==='Brian').onclick();assert.match(s.pre.textContent,/^Brian/);
 assert.match(s.api.select('Jay','上周'),/Jay · 自动信息简报 上周/);assert.deepEqual(s.calls.at(-1),['Jay','上周']);assert.equal(s.pre.dataset.period,'上周');
 assert.equal(s.api.select('Mallory'),null);
});
test('revoked access hides and clears the brief',()=>{
 const s=setup();s.deny();s.api.render();assert.equal(s.pre.textContent,'');assert.equal(s.host.children[0].hidden,true);
});
