import test from 'node:test';import assert from 'node:assert/strict';
import {expertProfile,expertProfileText} from '../supabase/functions/agent-conversation/product-expert-profile.mjs';
test('evidence dimensions retain sources without claiming knowledge completeness',()=>{
 const f={field:'厚度',value:'50mm',asset:'合成手册',page:2,version:'v1',current:false};
 const p=expertProfile({findings:[f],partial:true,conflicts:[]});
 assert.equal(p.dimensions.find(d=>d.id==='structure').evidence[0],f);
 assert.equal(p.selection_ready,false);assert.equal(p.human_verified,false);assert.equal(p.gaps.length,7);
 assert.match(expertProfileText(p),/第2页，v1，历史版本/);assert.match(expertProfileText(p),/不代表物料库不存在/);
});
test('certification mention does not authorize a certification or selection claim',()=>{
 const p=expertProfile({findings:[{field:'认证',value:'待申请',asset:'合成文件',page:1}],conflicts:[{}]});
 assert.equal(p.dimensions.find(d=>d.id==='certification').status,'unverified');
 assert.equal(p.selection_ready,false);assert.ok(p.blockers.some(x=>x.includes('不同表述')));
});
test('missing dimensions remain missing, and unrelated text is not a fact',()=>{
 const p=expertProfile({findings:[{field:'备注',value:'可能适合医院',asset:'合成',page:1}]});
 assert.equal(p.gaps.length,8);assert.equal(p.scope,'current_authorized_retrieval');
});
