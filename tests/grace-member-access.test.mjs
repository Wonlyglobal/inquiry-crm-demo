import test from 'node:test';
import assert from 'node:assert/strict';
import {eligible,eligibleMember} from '../supabase/functions/agent-conversation/policy.mjs';

const active=role=>({active:true,role});
test('only the two approved active CRM members receive member access',()=>{
 assert.equal(eligibleMember({email:'huyitai@wonlyglobal.com'},active('marketing')),true);
 assert.equal(eligibleMember({email:'LINGZX@WONLYGLOBAL.COM'},active('sales_manager')),true);
 assert.equal(eligibleMember({email:'other@wonlyglobal.com'},active('sales_manager')),false);
 assert.equal(eligibleMember({email:'huyitai@wonlyglobal.com'},{active:false,role:'marketing'}),false);
});
test('member grants do not turn members into the exact owner',()=>{
 assert.equal(eligible({id:'member',email:'huyitai@wonlyglobal.com'},active('owner')),false);
 assert.equal(eligible({id:'member',email:'lingzx@wonlyglobal.com'},active('owner')),false);
});
