import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccessInquiry} from '../supabase/functions/_shared/inquiry-access.ts';
const db=(team,error=null)=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{team},error})})})})});
const actor={id:'manager',role:'sales_manager',active:true,team:'a'};
test('inquiry scope denies cross-team, unknown teams, inactive and unauthorized roles',async()=>{
  for(const [profile,team] of [[actor,'b'],[{...actor,team:null},null],[{...actor,active:false},'a'],[{...actor,role:'marketing'},'a'],[{...actor,role:'sales'},'a']])
    assert.equal(await canAccessInquiry(db(team),profile,{owner_id:'other'}),false);
  assert.equal(await canAccessInquiry(db('a',new Error('offline')),actor,{owner_id:'other'}),false);
  assert.equal(await canAccessInquiry(db('a'),actor,{owner_id:null}),false);
});
test('inquiry scope preserves active owner, self and same-team manager access',async()=>{
  assert.equal(await canAccessInquiry(db('a'),actor,{owner_id:'other'}),true);
  assert.equal(await canAccessInquiry(db('b'),{...actor,role:'owner'},{owner_id:'other'}),true);
  assert.equal(await canAccessInquiry(db(null),{...actor,role:'sales'},{owner_id:actor.id}),true);
});
