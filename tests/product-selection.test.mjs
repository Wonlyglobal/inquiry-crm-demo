import test from 'node:test';import assert from 'node:assert/strict';
import {selectionRequirements,selectProducts,selectionAnswer} from '../supabase/functions/agent-conversation/product-selection.mjs';
import {crossPageCandidates} from '../supabase/functions/agent-conversation/cross-page-evidence.mjs';
const product=(model,value,field='门扇厚度')=>({model,category:'wooden_door',catalog:'合成',page:1,specs:{[field]:value}});
test('selection separates matches conflicts and unknown units or components',()=>{
 const r=selectProducts({products:[product('A','50mm'),product('B','40mm'),product('C','5cm'),product('D','50mm','钢板厚度')]},selectionRequirements('木门选型，门扇厚度至少45毫米'));
 assert.deepEqual(r.rows.map(r=>r.status),['candidate','conflict','unknown','unknown']);
});
test('inconsistent catalogue values and missing citations cannot pass',()=>{
 const p=product('A','50mm');delete p.page;
 const r=selectProducts({products:[p,product('B','50mm'),product('B','40mm')]},selectionRequirements('木门选型，门扇厚度至少45毫米'));
 assert.ok(r.rows.every(r=>r.status==='unknown'));
 assert.match(selectionAnswer({products:[]},'帮我选防火门'),/未支持的条件不会被自动判为满足/);
});
test('negative or optional features never match',()=>{
 const r=selectProducts({products:[{...product('A','不支持指纹开锁','开锁方式'),category:'smart_lock'}]},selectionRequirements('智能锁选型，指纹开锁'));
 assert.equal(r.rows[0].status,'unknown');
});
const asset=chunks=>({name:'合成',document:{status:'ready',pages:chunks.map((text,i)=>({page:i+1,chunks:[text]}))}});
test('explicit adjacent continuation is a candidate, never verified attribution',()=>{const r=crossPageCandidates(['TEST-100'],[asset(['TEST-100 参数','续表\n材质：钢'])]);assert.equal(r.length,1);assert.equal(r[0].status,'needs_review')});
test('no marker, other model, gap or multiple owners prevents attribution',()=>{
 for(const texts of [['TEST-100','材质：钢'],['TEST-100','续表\nOTHER-200 参数'],['TEST-100 TEST-200','续表\n材质：钢']])assert.equal(crossPageCandidates(['TEST-100','TEST-200'],[asset(texts)]).length,0);
 const a=asset(['TEST-100','续表']);a.document.pages[1].page=3;assert.equal(crossPageCandidates(['TEST-100'],[a]).length,0);
});
