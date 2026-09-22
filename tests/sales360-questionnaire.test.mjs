import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const bank=JSON.parse(readFileSync(new URL('../data/sales360-questionnaire-v2.json',import.meta.url),'utf8'));
const migration=readFileSync(new URL('../supabase/migrations/20260922110000_sales360_behavior_questionnaire.sql',import.meta.url),'utf8');
test('browser and server share the exact versioned questionnaire',()=>{
 const canonical=JSON.parse(migration.split('$json$')[1]);assert.deepEqual(bank,canonical);
 assert.equal(bank.version,'360-behavior-v2');
});
test('questionnaire covers all five roles without changing dimension groups',()=>{
 const expected={owner:3,manager:4,peer:3,marketing:3,self:3};
 for(const [group,count] of Object.entries(expected)){
  const questions=bank.groups[group];assert.equal(questions.length,count*3);
  assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
  const dims=new Set(questions.map(q=>q.dimension));assert.equal(dims.size,count);
  for(const d of dims)assert.equal(questions.filter(q=>q.dimension===d).length,3);
 }
 assert.equal(bank.short_questions.filter(q=>q.required).length,3);
 assert.equal(bank.short_questions.length,4);
 assert.equal(bank.scale.some(s=>s.value==='na'),true);
});

test('NRS bank keeps role questions and provides all eleven scores plus unobserved',()=>{
 const nrs=JSON.parse(readFileSync(new URL('../data/sales360-questionnaire-nrs-v3.json',import.meta.url),'utf8'));
 const sql=readFileSync(new URL('../supabase/migrations/20260922123000_sales360_nrs.sql',import.meta.url),'utf8');
 assert.deepEqual(nrs,JSON.parse(sql.split('$json$')[1]));
 assert.deepEqual(nrs.groups,bank.groups);assert.deepEqual(nrs.short_questions,bank.short_questions);
 assert.deepEqual(nrs.scale.map(x=>x.value),[0,1,2,3,4,5,6,7,8,9,10,'na']);
});
