import test from 'node:test';
import assert from 'node:assert/strict';
import {canUseAgentWorld} from '../assets/agent-world.mjs';
const id='c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
const profile={id,role:'owner',active:true};const user={id,email:'chloelee@wonlyglobal.com'};
test('agent world is restricted to the approved active identity and role',()=>{
 assert.equal(canUseAgentWorld(profile,user),true);
 for(const [p,u] of [[null,user],[profile,null],[{...profile,active:false},user],[{...profile,id:'other'},user],[profile,{...user,id:'other'}],[profile,{...user,email:'other@wonlyglobal.com'}],...['marketing','sales','sales_manager'].map(role=>[{...profile,role},user])])assert.equal(canUseAgentWorld(p,u),false);
 assert.equal(canUseAgentWorld({...profile,email:user.email},{id,email:'other@wonlyglobal.com'}),false);
});
