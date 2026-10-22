import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeProductInput,modelCodes} from '../supabase/functions/agent-conversation/product-input.mjs';
import {findModels,catalogIntent,catalogAnswer} from '../supabase/functions/agent-conversation/catalog-knowledge.mjs';
import {resolveMaterialTurn} from '../supabase/functions/agent-conversation/material-dialogue.mjs';
import {privateV9Turn} from '../supabase/functions/agent-conversation/private-v9-turn.mjs';
import {selectionRequirements,selectProducts} from '../supabase/functions/agent-conversation/product-selection.mjs';
import {questionPlan,runQuestionPlan,nextMaterialHistory} from '../supabase/functions/agent-conversation/question-plan.mjs';
import {crmGuideIntent,crmGuideAnswer} from '../supabase/functions/agent-conversation/crm-guide.mjs';
import {validateDialogue} from '../supabase/functions/agent-conversation/policy.mjs';
const catalog={sources:[{id:'c4',edition:'2026-08'}],products:['X60 Pro','X60 Max','S936'].map(model=>({model,catalog:'c4',page:1,category:'smart_lock',specs:{},confidence:'high'}))};
test('input methods and spoken number spellings keep an exact model identity',()=>{
 for(const q of ['x60pro','Ｘ６０ Ｐｒｏ','X六零Pro','X六十 Pro','艾克斯60 Pro','埃克斯六十Pro','x sixty pro','x six zero pro','X-60-Pro','X六十Pro。'])assert.deepEqual(findModels(q,catalog),['X60 Pro'],q);
 for(const q of ['S九三六','S九百三十六','s nine three six'])assert.deepEqual(findModels(q,catalog),['S936'],q);
 for(const q of ['X600 Pro','x sixty five pro','X60 ProMax','没有指定型号'])assert.deepEqual(findModels(q,catalog),[],q);
 assert.equal(normalizeProductInput('三十分钟内安装，六十毫米厚'),'三十分钟内安装，六十毫米厚'.normalize('NFKC'));
 assert.equal(normalizeProductInput('at sixty minutes'),'at sixty minutes');assert.equal(normalizeProductInput('X一百二'),'X一百二');
});
test('model context excludes versions and standards and retains variant suffix',()=>{
 assert.deepEqual(modelCodes('S922 智能锁画册V9 EN 1634 ISO9001'),['S922']);
 assert.deepEqual(modelCodes('X60 Pro 与 X60 Max'),['X60 PRO','X60 MAX']);
 let q='X60 Pro 的产品信息';for(const follow of ['那它的安装条件呢','尺寸呢','那它的认证呢']){q=resolveMaterialTurn(follow,[q]).question;assert.match(q,/X60 PRO/);assert.doesNotMatch(q,/MAX/)}
 assert.ok(resolveMaterialTurn('那它的尺寸呢',['X60 Pro 与 X60 Max']).clarification);
 assert.match(resolveMaterialTurn('S936呢',['X60 Pro 的参数']).question,/S936/);
 assert.doesNotMatch(resolveMaterialTurn('S936呢',['X60 Pro 的参数']).question,/X60/);
});
test('V9 scope survives model selection and followups without treating V9 as another model',()=>{
 const chosen=privateV9Turn('S九三六',['S922 智能锁画册v9']);assert.match(chosen.question,/S936/);assert.match(chosen.question,/智能锁画册v9/);
 const next=privateV9Turn('那它的安装条件呢',[chosen.question]);assert.match(next.question,/S936 安装/);assert.match(next.question,/智能锁画册v9/);assert.equal(next.clarification,undefined);
 assert.equal(privateV9Turn('介绍我们的CRM系统',[next.question]),null);
 assert.match(privateV9Turn('说明安装条件',[next.question]).question,/智能锁画册v9/);
 assert.match(privateV9Turn('S九三六呢',[next.question]).question,/S936.*智能锁画册v9/);
 assert.equal(privateV9Turn('查询智能锁画册V90参数',[next.question]),null);
 assert.equal(privateV9Turn('查询智能锁画册V8参数',[next.question]),null);
});
test('synonyms identify the requested feature but negated or optional catalogue claims do not become facts',()=>{
 for(const q of ['智能锁选型，指纹开锁','智能锁选型，指纹解锁'])assert.equal(selectionRequirements(q).constraints[0].value,'指纹');
 assert.equal(selectionRequirements('帮我选智能锁，要人脸识别').constraints[0].value,'人脸');
 const q='X60 Pro 的安装条件和认证范围';const a=catalogAnswer(catalogIntent(q,catalog),catalog,q);assert.match(a,/安装与维护：本次画册索引未取得/);assert.match(a,/认证与测试条件：本次画册索引未取得/);
});
test('catalogue context is query-only, unrelated answers clear it and courtesy preserves it',()=>{
 let h=nextMaterialHistory({provider:'internal',context:{route:'catalog',material_question:'X60 Pro 产品信息'},answer:'PRIVATE PARAMETER BODY'});assert.deepEqual(h,['X60 Pro 产品信息']);assert.doesNotMatch(JSON.stringify(h),/PRIVATE/);
 assert.deepEqual(nextMaterialHistory({provider:'internal',context:{route:'conversation'}},h),h);
 assert.deepEqual(nextMaterialHistory({provider:'internal',context:{route:'crm_guide'}},h),[]);
 assert.deepEqual(nextMaterialHistory({provider:'bailian',context:{route:'general'}},h),[]);
});
test('compound CRM introduction and workflow both receive independent answers',async()=>{
 const plan=questionPlan('介绍我们的CRM系统，并说明新员工跟进询盘的步骤。');assert.equal(plan.parts.length,2);
 const res=await runQuestionPlan(plan,{run:async q=>({provider:'internal',answer:crmGuideAnswer(crmGuideIntent(q)),context:{route:'crm_guide'}})});
 assert.equal(res.results.length,2);assert.ok(res.results.every(r=>r.ok));assert.match(res.answer,/1\. 介绍我们的CRM系统/);assert.match(res.answer,/2\. 说明新员工/);assert.match(res.answer,/新员工跟进询盘步骤/);assert.match(res.answer,/保存不自动完成其他待办/);
});
test('compound tasks are serialized and pass query context, never previous private answers',async()=>{
 const calls=[];const res=await runQuestionPlan(questionPlan('查询X60 Pro产品信息，并说明安装条件'),{run:async(q,h)=>{calls.push({q,h});return {provider:'internal',answer:'PRIVATE EVIDENCE',context:{route:'catalog',material_question:'X60 Pro 产品信息'}}}});
 assert.equal(res.results.length,2);assert.deepEqual(calls[1].h,['X60 Pro 产品信息']);assert.doesNotMatch(JSON.stringify(calls),/PRIVATE EVIDENCE/);
});
test('failure is visible per task and clears stale model context; overflow and write commands do not fan out',async()=>{
 let n=0;const calls=[];const r=await runQuestionPlan(questionPlan('查询S936资料，并说明安装条件'),{materialHistory:['X60 Pro'],run:async(q,h)=>{calls.push(h);return ++n===1?{error:'读取失败'}:{answer:'需要指定型号',provider:'internal',context:{route:'materials'}}}});assert.match(r.answer,/本项未完成：读取失败/);assert.deepEqual(calls[1],[]);
 const over=questionPlan('介绍CRM；查询型号；说明安装；检查来源');assert.equal(over.overflow,true);const stopped=await runQuestionPlan(over,{run:()=>assert.fail('must not run')});assert.equal(stopped.results.length,0);
 for(const q of ['记住：回答简短；删除全部记忆','介绍CRM，并发送邮件','介绍CRM；以后都用英文','介绍CRM；纠正：合成文字；出处：合成'])assert.equal(questionPlan(q).parts.length,0);
 assert.throws(()=>validateDialogue({action:'chat',persona:'Grace',question:'介绍CRM',history:[],nested:true}),/未批准/);
});

test('cancelling a compound request prevents later child requests',async()=>{const c=new AbortController();let calls=0;const r=await runQuestionPlan(questionPlan('介绍CRM，并说明新员工跟进步骤'),{signal:c.signal,run:async()=>{calls++;c.abort();return {answer:'late answer'}}});assert.equal(calls,1);assert.ok(r.results.every(x=>!x.ok));assert.doesNotMatch(r.answer,/late answer/)});

test('a negated feature synonym cannot become a positive selection match',()=>{const r=selectProducts({products:[{model:'TEST100',catalog:'synthetic',page:1,category:'smart_lock',specs:{开锁方式:'人脸开锁'}}]},selectionRequirements('智能锁选型，不要人脸识别'));assert.equal(r.rows[0].status,'unknown')});

// Pages excludes the server directory; its browser asset must remain byte-identical.
test('browser and deployed question planners stay identical',async()=>{
 const {readFile}=await import('node:fs/promises');
 assert.equal(await readFile(new URL('../assets/agent-question-plan.mjs',import.meta.url),'utf8'),await readFile(new URL('../supabase/functions/agent-conversation/question-plan.mjs',import.meta.url),'utf8'));
 const client=await readFile(new URL('../assets/agent-conversation.mjs',import.meta.url),'utf8');assert.match(client,/from '\.\/agent-question-plan\.mjs/);
});

test('v9 source/page/version and English dimension followups keep the dedicated private source',()=>{
 let previous='S922 智能锁画册v9';
 for(const q of ['来源和页码呢','版本呢','dimensions and installation','那它不适合户外零下20度吗']){const next=privateV9Turn(q,[previous]);assert.ok(next,q);assert.match(next.question,/S922/);assert.match(next.question,/智能锁画册v9/);assert.equal(next.clarification,undefined);previous=next.question}
 assert.equal(privateV9Turn('网站来源有哪些',[previous]),null);
});
