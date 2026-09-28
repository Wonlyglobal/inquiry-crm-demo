#!/usr/bin/env node
// Turns "没用" answer ratings into DRAFT exam cases for review.
//   1) Export (on a trusted machine, service role, no model involved):
//      select id,persona,reason,route,question,note from agent_answer_feedback where rating='down' and created_at>now()-interval '30 days';
//      save as JSON array -> feedback.json
//   2) node scripts/feedback-to-cases.mjs feedback.json  -> tests/evals/out/feedback-cases-draft.json
// Drafts are NOT added to the exam automatically: the exam sends questions to Bailian, so a person must
// rewrite each question without customer names/contacts (flagged below) and choose the context fixtures.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const RUBRIC={wrong_data:['zh','plain','gaps','dates'],off_topic:['zh','plain'],too_long:['zh','plain'],too_vague:['zh','plain','metric','next_step'],tone:['zh','plain','no_detect_claim'],other:['zh','plain']};
const FLAG=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\+|00)\d[\d \-]{7,}|\b[a-z0-9-]+\.(?:com|net|org|cn|ae|sa|mx|co)\b|(?:LLC|Ltd|GmbH|S\.A\.|公司|集团)/i;
export function draftCases(rows){
 return (Array.isArray(rows)?rows:[]).filter(r=>r&&typeof r.question==='string'&&r.question.trim()).slice(0,50).map(r=>({
  id:`fb-${r.id}`,category:'feedback',persona:['Grace','Brian','Jay'].includes(r.persona)?r.persona:'Grace',question:r.question.trim().slice(0,300),context:[],
  rubric:RUBRIC[r.reason]||RUBRIC.other,review:{reason:r.reason||'other',route:r.route||null,note:r.note||null,
   needs_rewrite:FLAG.test(r.question),todo:'改写成不含客户名称和联系方式的问题；选择 context（crm/seo/research/social）；必要时补一条针对性评分规则后，再手动加入 grace-eval-cases.json'}}));
}
if(import.meta.url===`file://${process.argv[1]}`){
 const src=process.argv[2];if(!src){console.error('用法：node scripts/feedback-to-cases.mjs feedback.json');process.exit(1)}
 const cases=draftCases(JSON.parse(readFileSync(src,'utf8')));const out=new URL('../tests/evals/out/',import.meta.url);mkdirSync(out,{recursive:true});
 writeFileSync(new URL('feedback-cases-draft.json',out),JSON.stringify(cases,null,1));
 console.log(JSON.stringify({drafts:cases.length,needs_rewrite:cases.filter(c=>c.review.needs_rewrite).length}));
}
