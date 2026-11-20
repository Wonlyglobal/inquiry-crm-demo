import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeDocument} from '../supabase/functions/agent-conversation/document-knowledge.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
import {conciseMaterialAnswer} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
const term='断开设备连接';
const quote='请先断开设备连接，然后检查外壳。';
const q='物料：'+term;
const doc=({page=2,truncated=false,kind='native_text',line=quote}={})=>normalizeDocument({
 status:'partial',sha256:'a'.repeat(64),pages_total:3,
 pages:[{page:2,truncated,kind,chunks:[line]}],
 knowledge_profile:{schema:'evidence-profile-v2',method:'offline_extractive_rules',summary:[{page,quote}]}
},q);
const asset=(document=doc(),name='合成手册.pdf',isCurrentVersion=true)=>({name,versionLabel:'V1',isCurrentVersion,document});
const data=(...assets)=>gateMaterialEvidence({status:'available',assets});
test('returns the source quote and edition on a short literal lookup',()=>{
 const d=data(asset());
 assert.equal(d.assets[0].document.knowledge_profile,null);
 assert.equal(conciseMaterialAnswer(d,q),quote+'\n来源：合成手册.pdf，V1，第2页。');
});
test('rejects mismatched pages, absent text, truncated pages, and spreadsheets',()=>{
 for(const x of [{page:3},{line:'无关正文'},{truncated:true},{kind:'sheet_cells'}])
  assert.deepEqual(data(asset(doc(x))).assets[0].document.source_summaries,[]);
});
test('does not pick an ambiguous or historical source',()=>{
 for(const i of [data(asset(),asset(doc(),'另一份手册.pdf')),data(asset(doc(),'历史手册.pdf',false))])
  assert.doesNotMatch(conciseMaterialAnswer(i,q),/^请先断开设备连接/u);
});
test('does not serve document summary as a model parameter',()=>{
 assert.doesNotMatch(conciseMaterialAnswer(data(asset()),'物料：Z123尺寸是多少'),/^请先断开设备连接/u);
});
