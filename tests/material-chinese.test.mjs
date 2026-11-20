import test from 'node:test';
import assert from 'node:assert/strict';
import {presentMaterialAnswer} from '../supabase/functions/agent-conversation/material-chinese.mjs';
test('Chinese product display retains model, numeric values, conditions and source',()=>{
 const a=presentMaterialAnswer('TEST90：\n- Standard features：Fingerprint + Passcode + M1 Encrypted Card + Key + App\n- Power：220 V Mains Supply (Optional)\n出处：零售画册 PDF第8页','TEST90参数');
 assert.match(a,/指纹.*密码.*M1加密卡.*钥匙/);assert.match(a,/220 V.*可选/);assert.match(a,/PDF第8页/);assert.doesNotMatch(a,/Fingerprint|Standard features/);
});
test('explicit originals stay intact; unknown prose is marked rather than guessed',()=>{
 const raw='- Material：Unknown proprietary substance\n出处：零售画册 PDF第8页';
 assert.equal(presentMaterialAnswer(raw,'请看英文原文'),raw);
 const a=presentMaterialAnswer(raw,'不要英文原文，只用中文');
 assert.doesNotMatch(a,/Unknown/);assert.match(a,/中文释义尚待核对/);assert.match(a,/第8页/);
});
test('curated fact meanings keep their edition and do not alter source data',()=>{
 const c={facts:[{text:'Synthetic fact.',zh:'合成事实。'}]};
 const a=presentMaterialAnswer('- 画册原文：“Synthetic fact.”\n来源：2026-08，零售画册 PDF第3页。','品牌介绍',c);
 assert.match(a,/合成事实/);assert.match(a,/2026-08/);assert.equal(c.facts[0].text,'Synthetic fact.');
});
import {resolveMaterialTurn} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
test('an explicit company fact request does not inherit a previous product',()=>{
 const q='王力有哪些研发投入与团队？请按画册简洁说明并注明出处。';
 assert.equal(resolveMaterialTurn(q,['私有产品：S50 Pro 标准功能']).question,q);
});
