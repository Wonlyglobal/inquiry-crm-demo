import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enterpriseSession} from '../supabase/functions/agent-conversation/enterprise-session.mjs';
import {graceMemberAllowed,memberDialogue} from '../supabase/functions/agent-conversation/member-dialogue.mjs';

const authorized = 'member-a,member-b';
const user = {id:'member-a',email_confirmed_at:'2026-11-23T00:00:00Z'};
const profile = {id:user.id,active:true,role:'marketing'};
const chat = {action:'chat',persona:'Grace',question:'如何查看询盘商机？',history:[]};

test('member chat is limited to verified, active and explicitly listed IDs',()=>{
 assert.equal(graceMemberAllowed(user,profile,authorized),true);
 assert.equal(graceMemberAllowed({...user,id:'member-b'},{...profile,id:'member-b',role:'sales_manager'},authorized),true);
 assert.equal(graceMemberAllowed(user,profile,''),false);
 assert.equal(graceMemberAllowed(user,profile,'member-ab'),false);
 assert.equal(graceMemberAllowed(user,{...profile,id:'someone-else'},authorized),false);
 assert.equal(graceMemberAllowed(user,{...profile,active:false},authorized),false);
 assert.equal(graceMemberAllowed({...user,email_confirmed_at:null},profile,authorized),false);
 assert.deepEqual(enterpriseSession(user,profile),{accountId:user.id,role:'marketing',space:'enterprise'});
});

test('member text guide succeeds and owner or voice features stay out of member chat',async()=>{
 const records=[];
 const ctx={user,profile,input:chat,audit:async record=>records.push(record)};
 const result=await memberDialogue(ctx);
 assert.equal(result.status,200);
 assert.match(result.body.answer,/询盘商机/);
 assert.equal(records[0].actor_id,user.id);
 for(const patch of [{action:'material-file'},{voice:true},{phone:true},{persona:'Jay'},{question:'王力私有物料的规格是什么？'}]){
  assert.ok((await memberDialogue({...ctx,input:{...chat,...patch}})).status>=400);
 }
 assert.equal(records.length,1);
});

test('general model input contains only the current question and fixed persona',async()=>{
 const r=await memberDialogue({user,profile,input:{...chat,question:'一句话解释什么是月食',history:[]},audit:async()=>{},answerGeneral:async input=>{
  assert.deepEqual(input,{action:'chat',persona:'Grace',question:'一句话解释什么是月食',history:[]});
  return '地球挡住太阳照向月球的光。';
 }});
 assert.equal(r.status,200);
});

test('enterprise bootstrap and personal history precede the restricted chat gate',()=>{
 const edge=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 const owner=edge.indexOf('if(!eligible(user,profile))');
 for(const action of ['enterprise-session','grace-thread']){
  const route=edge.indexOf(`if(input.action==='${action}')`);
  assert.ok(route>=0&&route<owner);
 }
 assert.match(edge,/graceMemberAllowed\(user,profile,Deno\.env\.get\('GRACE_MEMBER_ACCOUNT_IDS'\)\)/);
 assert.match(edge,/threadOperation\(db,user\.id,input\)/);
});
