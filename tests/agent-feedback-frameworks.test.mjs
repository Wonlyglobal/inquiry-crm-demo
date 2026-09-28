import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateFeedback,feedbackSummaryIntent,feedbackSummaryAnswer} from '../supabase/functions/agent-conversation/answer-feedback.mjs';
import {personaFramework,salesIntent,decisionIntent} from '../supabase/functions/agent-conversation/persona-frameworks.mjs';
import {draftCases} from '../scripts/feedback-to-cases.mjs';
test('Brian and Jay get their role frameworks only for matching questions',()=>{
 assert.match(personaFramework('Brian','客户一周没回复报价怎么跟进'),/推进五步/);assert.equal(personaFramework('Brian','今天天气'),'');
 assert.match(personaFramework('Jay','展会还是SEO，预算先给哪个'),/决策五步/);assert.match(personaFramework('Jay','要不要设海外仓'),/暂不做/);
 assert.equal(personaFramework('Grace','客户怎么跟进'),'');assert.ok(salesIntent('样品运费谁付'));assert.ok(decisionIntent('该不该砍掉这条线'));
 assert.match(personaFramework('Jay','要不要做'),/不写“Jay 批准”/);assert.match(personaFramework('Brian','报价'),/不承诺价格、交期/);
});
test('feedback keeps text only for "没用" and rejects bad input',()=>{
 const up=validateFeedback({persona:'Grace',rating:'up',question:'q',answer:'a',route:'general'});assert.equal(up.p_question,null);assert.equal(up.p_answer,null);assert.equal(up.p_reason,null);
 const down=validateFeedback({persona:'Brian',rating:'down',reason:'too_vague',question:'怎么跟进',answer:'x'.repeat(3000),note:' 太虚 '});
 assert.equal(down.p_answer.length,2000);assert.equal(down.p_note,'太虚');assert.equal(down.p_reason,'too_vague');
 assert.throws(()=>validateFeedback({persona:'Grace',rating:'down'}),/格式/);assert.throws(()=>validateFeedback({persona:'X',rating:'up'}),/格式/);
 assert.throws(()=>validateFeedback({persona:'Grace',rating:'down',reason:'other',note:'密码: 123456'}),/凭据/);
});
test('summary command and answer',()=>{
 assert.deepEqual(feedbackSummaryIntent('查看回答反馈'),{days:7});assert.deepEqual(feedbackSummaryIntent('最近30天反馈汇总'),{days:30});assert.deepEqual(feedbackSummaryIntent('本月反馈'),{days:30});
 assert.equal(feedbackSummaryIntent('客户反馈说价格太高怎么办'),null);
 assert.match(feedbackSummaryAnswer({days:7,by_persona:[],by_route:[],reasons:[],recent_down:[]}),/还没有回答反馈/);
 const a=feedbackSummaryAnswer({days:7,by_persona:[{persona:'Grace',up:6,down:2}],by_route:[{route:'general',up:3,down:2}],reasons:[{reason:'too_vague',n:2}],recent_down:[{id:5,day:'2026-09-28',persona:'Grace',reason:'too_vague',question:'怎么做社媒',note:null}]});
 assert.match(a,/共 8 条/);assert.match(a,/没用占 25%/);assert.match(a,/太空泛、不具体 2 次/);assert.match(a,/#5/);assert.match(a,/记住：以后建议都写具体动作/);assert.match(a,/未发送给外部模型/);
});
test('feedback drafts flag customer names and are never auto-added',()=>{
 const c=draftCases([{id:3,persona:'Brian',reason:'wrong_data',question:'Example Door Trading LLC 报价怎么跟',route:'general'},{id:4,persona:'Jay',reason:'too_vague',question:'要不要加预算'},{id:5,question:''}]);
 assert.equal(c.length,2);assert.equal(c[0].review.needs_rewrite,true);assert.equal(c[1].review.needs_rewrite,false);assert.deepEqual(c[1].rubric,['zh','plain','metric','next_step']);
 const sql=readFileSync(new URL('../supabase/migrations/20260928160000_agent_answer_feedback.sql',import.meta.url),'utf8');
 assert.match(sql,/check \(rating='down' or \(question is null and answer_excerpt is null\)\)/);assert.match(sql,/agent_correction_actor\(\)/);
});
