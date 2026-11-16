import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogPageIntent,catalogNameIntent,catalogRequestTurn} from '../supabase/functions/agent-conversation/agent-actions.mjs';
import {resolveMaterialTurn,conciseMaterialAnswer} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
const rows=[];
function check(group,question,history,expected,actual){rows.push({id:rows.length+1,group,question,history,expected,actual,pass:JSON.stringify(expected)===JSON.stringify(actual)});}
const cats=[['智能锁','c4'],['木门','c3'],['工程','c1'],['零售','c2']];
const requests=['我需要{c}画册','给我{c}画册','请打开{c}画册','麻烦发我{c}画册','能给我{c}画册吗','我想看看{c}画册','帮忙找一下{c}画册','{c}画册发一下','急用，给我{c}画册','请给我一本{c}画册','我要{c}画册，谢谢','{c}画册在哪，帮我打开','能不能打开{c}画册','发份{c}画册给我','我想下载{c}画册','帮我调出{c}画册','请把{c}画册打开','给我看看{c}画册','找下{c}画册','{c}画册，我要文件'];
for(const [c,id] of cats)for(const t of requests)for(const suffix of ['', '。','！','？','\n']){const q=t.replace('{c}',c)+suffix;check('file_request',q,[],{open:true,catalog:id},{open:catalogPageIntent(q),catalog:catalogNameIntent(q)});}
const negatives=['不要打开{c}画册','别下载{c}画册','不用发{c}画册','我不是要{c}画册','{c}画册里的供电是多少','{c}画册里的材质是什么','{c}画册里的保修多久','{c}画册尺寸是多少，请附PDF页码','不用打开{c}画册，只回答尺寸','{c}画册里的参数有来源吗'];
for(const [c] of cats)for(const t of negatives)for(const suffix of ['', '。','！','？','\n']){const q=t.replace('{c}',c)+suffix;check('fact_or_negation',q,[],false,catalogPageIntent(q));}
const followups=['画册','画册呢','发我画册','给我画册','打开画册','下载画册','那画册呢','它的画册呢','再发一下画册','刚才那本画册'];
for(const [c,id]of cats)for(const q of followups)for(const version of ['', ' V2',' V9',' 2026年版',' 2026年8月版']){const h=[`我需要${c}画册${version}`];const resolved=catalogRequestTurn(q,h);check('catalogue_followup',q,h,{open:true,catalog:id,version:true},{open:catalogPageIntent(resolved),catalog:catalogNameIntent(resolved),version:!version||resolved.includes(version.trim())});}
const leads=['','请问','我想知道','麻烦告诉我','直接说'];
const endings=['','？','呢','，谢谢','，别给无关内容'];
for(const lead of leads)for(const ending of endings)for(const field of ['隔音','质保','隔音和质保','材质']){const q=`物料：Test Acoustic Door ${lead}${field}${ending}`;const data={status:'available',assets:[{id:'synthetic',name:'Synthetic catalogue',versionLabel:'V1',isCurrentVersion:true,document:{status:'partial',pages:[],product_understanding:{status:'partial',findings:[{product:'Test Acoustic Door',field:'sound insulation',value:'31 dB under laboratory conditions',page:10,quote:'Test Acoustic Door: synthetic sound insulation 31 dB under laboratory conditions.'}]}}}]};const a=conciseMaterialAnswer(data,q);const supported=field.includes('隔音');check('parameter_answer',q,[],{value:supported,page:supported,gap:true,irrelevant:false},{value:a.includes('31 dB under laboratory conditions'),page:a.includes('第10页'),gap:field==='隔音'?/部分解析/.test(a):/未明确覆盖/.test(a),irrelevant:/竞品|Manusa|Portalp/.test(a)});}
for(const model of ['TEST-X1','TEST-X2','TEST-X3','TEST-X4'])for(const field of ['材质','尺寸','供电','保修','厚度'])for(const q of [`那它的${field}呢`,`它的${field}是多少`,`请问它的${field}`,`那${field}呢`,`继续说它的${field}`]){const history=[`物料：${model}`];const r=resolveMaterialTurn(q,history);check('parameter_followup',q,history,{model:true,field:true},{model:r.question?.includes(model)||false,field:r.question?.includes(field)||false});}
if(rows.length!==1000)throw Error('count '+rows.length);

for(const row of rows)test(`question matrix ${row.id}: ${row.group}: ${row.question}`,()=>assert.deepEqual(row.actual,row.expected));
