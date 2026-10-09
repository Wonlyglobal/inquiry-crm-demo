import test from 'node:test';
import assert from 'node:assert/strict';
import {canUseAgentWorld} from '../assets/agent-world.mjs';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../assets/agent-world.css',import.meta.url),'utf8');
const id='c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
const profile={id,role:'owner',active:true};const user={id,email:'chloelee@wonlyglobal.com'};
test('agent world is restricted to the approved active identity and role',()=>{
 assert.equal(canUseAgentWorld(profile,user),true);
 for(const [p,u] of [[null,user],[profile,null],[{...profile,active:false},user],[{...profile,id:'other'},user],[profile,{...user,id:'other'}],[profile,{...user,email:'other@wonlyglobal.com'}],...['marketing','sales','sales_manager'].map(role=>[{...profile,role},user])])assert.equal(canUseAgentWorld(p,u),false);
 assert.equal(canUseAgentWorld({...profile,email:user.email},{id,email:'other@wonlyglobal.com'}),false);
});
test('world switch is one subtle icon-only toggle',()=>{
 assert.match(html,/id="world-switch" class="world-switch hidden"[^>]*aria-label="切换到智能体世界"[^>]*><i data-lucide="orbit"><\/i><\/button>/);
 assert.doesNotMatch(html,/data-crm-world=/);
 assert.doesNotMatch(html,/>CRM 世界<|>智能体世界</);
 assert.match(css,/\.world-switch\{display:grid;place-items:center;width:38px;height:38px/);
 assert.match(html,/classList\.contains\('agent-world-active'\)\?'dashboard':'agent-world'/);
});

const world=await readFile(new URL('../assets/agent-world.mjs',import.meta.url),'utf8');
const holo=await readFile(new URL('../assets/agent-hologram.mjs',import.meta.url),'utf8');
const surface=await readFile(new URL('../assets/agent-hologram-surface.bin',import.meta.url));
test('agent world renders precomputed particle holograms with a 2D fallback',()=>{
 assert.equal(new DataView(surface.buffer,surface.byteOffset).getUint32(0,true),0x484f4c4f);
 assert.match(world,/loadHologram\(new URL\('\.\/agent-hologram-surface\.bin',import\.meta\.url\)\)/);
 assert.match(world,/if\(holo===null\)return;/);
 assert.match(world,/if\(!v\)\{drawOrb\(c,id\);return\}/);
 assert.match(world,/querySelectorAll\('canvas\[data-role\]'\)/);
 assert.match(holo,/getContext\('webgl2'/);
 assert.match(html,/assets\/agent-world\.mjs\?v=progress-20261003/);
});
test('private room shows a live board from page data and Grace opens into voice only after a real click',()=>{
 assert.match(world,/id="room-live"/);
 assert.match(world,/getLive\?\.\(selected\)/);
 assert.match(world,/if\(next==='Grace'&&event\?\.isTrusted\)/);
 assert.match(html,/getLive:name=>canUseAgentWorld\(profile,currentAuthUser\)\?worldLiveBoard\(name\):null/);
 assert.match(html,/function worldLiveBoard\(name\)\{\s*const c=aiDataContext\("近30天"\)/);
 assert.match(html,/type="days";start=new Date\(now\);start\.setDate\(now\.getDate\(\)-days\+1\)/);
});

test('private room fits one desktop screen with panels scrolling inside',()=>{
 assert.match(world,/function fitRoom\(\)\{const top=root\.getBoundingClientRect\(\)\.top\+scrollY;let h=Math\.max\(340,innerHeight-top-14\);root\.style\.setProperty\('--room-h'/);
 assert.match(css,/#agent-world\.in-private-room\{height:var\(--room-h/);
 assert.match(css,/#agent-world \.room-left #room-timeline\{flex:1;min-height:0;overflow:auto\}/);
});

test('one-screen room also covers mid-width windows and short scaled laptop screens',()=>{
 assert.ok(!css.includes('(min-width:1101px) and (min-height:600px)'));
 assert.match(css,/@media \(min-width:821px\) and \(min-height:420px\)\{/);
 assert.match(css,/@media \(min-width:821px\) and \(max-width:1100px\) and \(min-height:420px\)\{[^}]*grid-template-columns:minmax\(240px,300px\) minmax\(0,1fr\)/);
 assert.match(css,/@media \(min-width:821px\) and \(min-height:420px\) and \(max-height:680px\)\{/);
 assert.match(css,/\.room-left #room-timeline\{min-height:min\(140px,45%\)\}/);
});
