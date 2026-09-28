import test from 'node:test';import assert from 'node:assert/strict';
import {suite,buildPrompt,grade,report} from '../scripts/grace-eval.mjs';
test('exam covers marketing, country and company background checks with synthetic data only',()=>{
 const n=c=>suite.cases.filter(x=>x.category===c).length;
 assert.ok(n('marketing')>=10&&n('country')>=6&&n('company')>=4);
 assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}|\+\d{6,}/i.test(JSON.stringify(suite.fixtures)));
 for(const c of suite.cases)for(const r of c.rubric)assert.ok(suite.rubrics[r],c.id+' '+r);
});
test('every exam prompt builds through the production prompt path',()=>{
 for(const c of suite.cases){const b=buildPrompt(c);assert.equal(b.model,'qwen-plus');assert.equal(b.messages.at(-1).content,c.question)}
 assert.match(buildPrompt(suite.cases.find(c=>c.id==='bg-01')).messages[0].content,/countryBriefs/);
 assert.match(buildPrompt(suite.cases.find(c=>c.id==='co-01')).messages[0].content,/不得编造注册号/);
});
test('grader rewards grounded answers and penalises invented ROI, share and formatting',()=>{
 const c=suite.cases.find(x=>x.id==='bg-01');
 const good='结论：现有证据只能说明沙特在背调样本中进口商/经销商较多（样本58条，截至2026-09-20），不代表市场规模。缺口：准入认证需核实。下一步验证：联系三家经销商确认需求，指标待基线确认。';
 const bad='**结论**：沙特市场份额为35%，必须取得 SASO 认证方可进入。';
 assert.ok(grade(c,good).score>grade(c,bad).score);assert.equal(grade(c,'').answered,false);
 const r=report({[c.id]:good});assert.ok(r.unanswered.length===suite.cases.length-1);
});
import {marketingIntent} from '../supabase/functions/agent-conversation/deep-analysis.mjs';
test('marketing questions get the channel-quality framework, background questions do not',()=>{
 assert.match(buildPrompt(suite.cases.find(c=>c.id==='mkt-01')).messages[0].content,/渠道质量五问/);
 assert.equal(marketingIntent('这家客户靠谱吗'),false);
});
test('legacy mode reproduces the pre-branch prompt for a fair baseline',()=>{
 const c=suite.cases.find(x=>x.id==='bg-01');const now=buildPrompt(c).messages[0].content,old=buildPrompt(c,suite,{legacy:true}).messages[0].content;
 assert.match(now,/国家市场背调/);assert.ok(!old.includes('国家市场背调')&&!old.includes('countryBriefs'));
});
