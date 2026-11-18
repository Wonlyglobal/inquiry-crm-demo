import test from 'node:test';
import assert from 'node:assert/strict';
import {targetedMaterialAnswer} from '../supabase/functions/agent-conversation/targeted-material-answer.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
const make=(id,name,text,field)=>({id,name,isCurrentVersion:true,document:{status:'ready',sha256:id.repeat(64),pages_total:1,pages:[{page:1,chunks:[text],facts:field?[{field,quote:text}]:[]}]}});
test('detailed parameter answer excludes attachments that do not answer the question',()=>{
 const good=make('a','Parameter sheet','TEST80 PRO Dimensions 400mm','尺寸');
 const other=make('b','Event video','TEST80 PRO launched');
 const data=gateMaterialEvidence({status:'available',assets:[other,good]});
 const result=targetedMaterialAnswer(data,'详细说明 TEST80 PRO 尺寸');
 assert.match(result.answer,/400mm/);assert.deepEqual(result.materials.map(a=>a.id),['a']);
});
test('training answer and attachments retain only supporting current sources',()=>{
 const data=gateMaterialEvidence({status:'available',assets:[make('a','木门培训','维护和保养：使用软布。'),make('b','木门颜色','白色可选。')]});
 const result=targetedMaterialAnswer(data,'详细展开木门保养');
 assert.match(result.answer,/软布/);assert.deepEqual(result.materials.map(a=>a.id),['a']);
 assert.equal(targetedMaterialAnswer({...data,evidence_gate:undefined},'木门保养'),null);
});
