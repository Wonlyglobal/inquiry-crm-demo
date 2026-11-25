import test from 'node:test';import assert from 'node:assert/strict';
import {parameterSearchPlan,loadParameterMaterials} from '../supabase/functions/agent-conversation/product-parameter-search.mjs';
import {sourceTaskMaterials} from '../supabase/functions/agent-conversation/source-task.mjs';
import {productParameterAnswer} from '../supabase/functions/agent-conversation/product-parameter-answer.mjs';
import {ruleMaterialBound} from '../supabase/functions/agent-conversation/product-parameter-answer.mjs';
test('parameter search is bounded by exact model and requested fields',()=>{
 const p=parameterSearchPlan({model:'T80 MAX',question:'T80 MAX供电和材质'});
 assert.deepEqual(p.requests.map(r=>r.terms),[['T80 MAX'],['T80MAX']]);
 assert.equal(p.overflow,false);assert.equal(parameterSearchPlan({model:'T80',question:'介绍T80'}),null);
 assert.equal(parameterSearchPlan({model:'T80',question:'供电材质尺寸'}).overflow,false);
});
test('same paragraph model mention cannot attach a distant showroom material to a lock',()=>{
 const f={method:'rule',field:'材质',value:'synthetic board',quote:'T80 MAX\nDisplay area\nAnother product area\n材质：synthetic board'};
 assert.equal(ruleMaterialBound(f,'T80 MAX'),false);
 assert.equal(ruleMaterialBound({...f,quote:'T80 MAX\n材质：synthetic board'},'T80 MAX'),true);
});
test('a later spelling lookup retains same-source fields, not just its page',()=>{
 const f={product:'T80MAX',model:'T80MAX',field:'材质',value:'synthetic alloy',page:71,quote:'T80MAX material: synthetic alloy'};
 const asset={id:'synthetic',name:'Synthetic catalogue',versionLabel:'V1',isCurrentVersion:true,updatedAt:'2026-01-01',document:{status:'partial',sha256:'a'.repeat(64),pages:[],product_understanding:{findings:[]}}};
 const first={status:'available',evidence_gate:{version:1},assets:[asset]},second=structuredClone(first);
 second.assets[0].document.pages=[{page:71,chunks:[f.quote],facts:[]}];second.assets[0].document.product_understanding.findings=[f];
 const merged=sourceTaskMaterials([first,second,second]);
 assert.equal(merged.assets[0].document.product_understanding.findings.length,1);
 assert.match(productParameterAnswer(merged,'T80 Max材质'),/synthetic alloy/);
 assert.equal(first.assets[0].document.pages.length,0);
 second.assets[0].document.sha256='b'.repeat(64);
 assert.equal(sourceTaskMaterials([first,second]).assets.length,2);
});
test('failed field query and remaining pages are preserved as incomplete',async()=>{
 let n=0;const r=await loadParameterMaterials({model:'T80 MAX',question:'供电材质'},async()=>++n===1?{status:'available',assets:[],has_more:true}:{status:'unavailable',assets:[]});
 assert.equal(n,3);assert.equal(r.parameter_search.incomplete,true);assert.equal(r.has_more,false);
 const down=await loadParameterMaterials({model:'T80',question:'供电'},async()=>({status:'unavailable',assets:[]}));assert.equal(down.status,'unavailable');
});
test('dimension answer drops a bare duplicate only on the same source page',()=>{
 const quote='T80 MAX';
 const finding=value=>({product:'T80MAX',model:'T80MAX',field:'尺寸',value,page:4,quote});
 const asset={name:'Synthetic',isCurrentVersion:true,versionLabel:'V1',document:{sha256:'a'.repeat(64),pages:[{page:4,chunks:[quote],facts:[]}],product_understanding:{findings:[finding('400 × 80 × 50mm'),finding('前面板尺寸 400 × 80 × 50mm'),finding('后面板尺寸 400 × 80 × 70mm')]}}};
 const answer=productParameterAnswer({evidence_gate:{version:1},assets:[asset]},'T80 MAX尺寸');
 assert.doesNotMatch(answer,/未经人工参数核验/);assert.match(answer,/来源：/);
 assert.equal((answer.match(/400 × 80 × 50mm/g)||[]).length,1);assert.match(answer,/后面板/);
 const separate=structuredClone(asset);separate.name='Other source';separate.document.sha256='b'.repeat(64);separate.document.product_understanding.findings=[finding('400 × 80 × 50mm')];
 assert.equal((productParameterAnswer({evidence_gate:{version:1},assets:[asset,separate]},'T80 MAX尺寸').match(/400 × 80 × 50mm/g)||[]).length,2);
});
