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
