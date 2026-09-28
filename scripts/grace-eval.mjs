#!/usr/bin/env node
// Grace marketing-analysis and background-check exam.
//   node scripts/grace-eval.mjs prompts            -> tests/evals/out/prompts.json (no network)
//   DASHSCOPE_API_KEY=... node scripts/grace-eval.mjs run [--legacy] [--only mkt-01,bg-01]
//                                                  -> tests/evals/out/answers-<time>.json (synthetic fixtures only)
//   node scripts/grace-eval.mjs grade <answers.json> [--baseline <older answers.json>]
// Fixtures are synthetic. Never replace them with real CRM rows, customer names or contacts.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {requestBody} from '../supabase/functions/agent-conversation/policy.mjs';
import {analysisIntent,evidencePlan,deepAnalysisInstruction,marketingIntent,marketingFrameworkInstruction} from '../supabase/functions/agent-conversation/deep-analysis.mjs';
import {seoSummary} from '../supabase/functions/agent-conversation/seo.mjs';
import {seoIntent,seoOpportunities,seoFrameworkInstruction} from '../supabase/functions/agent-conversation/seo-opportunities.mjs';
import {backgroundContext} from '../supabase/functions/agent-conversation/background-research.mjs';
import {CHAT_URL,MODELS,providerJson,completionText} from '../supabase/functions/agent-conversation/bailian.mjs';

const dir=new URL('../tests/evals/',import.meta.url);
const read=f=>JSON.parse(readFileSync(new URL(f,dir)));
const fn=f=>JSON.parse(readFileSync(new URL('../supabase/functions/agent-conversation/'+f,import.meta.url)));
export const suite=read('grace-eval-cases.json');

// legacy=true reproduces the production prompt before this branch (no country brief, company checklist or channel framework).
export function buildPrompt(c,s=suite,{legacy=false}={}){
 const skipped={status:'not_requested'};
 const NOW=Date.parse('2026-09-28T03:00:00Z');
 const fixture=k=>k==='seo'?seoSummary(s.fixtures.seo_raw,NOW):s.fixtures[k];
 const ctx=Object.fromEntries(['research','crm','seo','social'].map(k=>[k,c.context.includes(k)?fixture(k):skipped]));
 const seoExtra=!legacy&&c.context.includes('seo')&&seoIntent(c.question)?{seoOpportunities:seoOpportunities(ctx.seo,NOW)}:{};
 const background=legacy?{countryBriefs:[],instruction:''}:backgroundContext(c.question,{research:ctx.research,crm:ctx.crm});
 const knowledge={publicFeed:fn('public-knowledge.json'),marketPlaybooks:fn('market-playbooks.json'),marketingLearning:fn('marketing-learning.json'),socialBusinessContext:fn('social-business-context.json')};
 const body=requestBody({question:c.question,persona:'Grace',history:[]},MODELS.chat,JSON.stringify({...knowledge,...ctx,socialPosts:skipped,socialLibrary:skipped,...background.countryBriefs.length?{countryBriefs:background.countryBriefs}:{},...seoExtra}));
 if(background.instruction)body.messages[0].content+='\n'+background.instruction;
 if(!legacy&&marketingIntent(c.question))body.messages[0].content+='\n'+marketingFrameworkInstruction;
 if(seoExtra.seoOpportunities)body.messages[0].content+='\n'+seoFrameworkInstruction;
 if(analysisIntent(c.question))body.messages[0].content+='\n'+deepAnalysisInstruction+'\n证据可用性：'+JSON.stringify(evidencePlan(ctx,Date.parse('2026-09-28T03:00:00Z')));
 body.messages[0].content+='\n当前日期：2026-09-28。本轮没有联网资料。';
 return body;
}

export function grade(c,answer,s=suite){
 const checks=[];
 for(const name of c.rubric){const r=s.rubrics[name];
  for(const re of r.must||[])checks.push({rubric:name,type:'must',pass:new RegExp(re,'m').test(answer||'')});
  for(const re of r.must_not||[])checks.push({rubric:name,type:'must_not',pass:!new RegExp(re,'m').test(answer||'')});
 }
 const passed=checks.filter(x=>x.pass).length;
 return {id:c.id,category:c.category,score:checks.length?passed/checks.length:0,failed:checks.filter(x=>!x.pass).map(x=>x.rubric+':'+x.type),answered:typeof answer==='string'&&answer.trim().length>0};
}

export function report(answers,s=suite){
 const rows=s.cases.map(c=>grade(c,answers[c.id],s));
 const by={};for(const r of rows)(by[r.category]??=[]).push(r.score);
 const avg=a=>a.length?Number((a.reduce((x,y)=>x+y,0)/a.length).toFixed(3)):0;
 return {total:avg(rows.map(r=>r.score)),categories:Object.fromEntries(Object.entries(by).map(([k,v])=>[k,avg(v)])),unanswered:rows.filter(r=>!r.answered).map(r=>r.id),rows};
}

async function main(){
 const [cmd,...rest]=process.argv.slice(2);const out=new URL('out/',dir);mkdirSync(out,{recursive:true});
 if(cmd==='prompts'){writeFileSync(new URL('prompts.json',out),JSON.stringify(Object.fromEntries(suite.cases.map(c=>[c.id,buildPrompt(c)])),null,1));console.log('prompts',suite.cases.length);return}
 if(cmd==='run'){
  const key=process.env.DASHSCOPE_API_KEY;if(!key)throw Error('需要 DASHSCOPE_API_KEY（只在本机环境变量中设置，不写入文件）');
  const only=rest.includes('--only')?rest[rest.indexOf('--only')+1].split(','):null,legacy=rest.includes('--legacy');const answers={};
  for(const c of suite.cases){if(only&&!only.includes(c.id))continue;
   try{answers[c.id]=completionText(await providerJson(CHAT_URL,buildPrompt(c,suite,{legacy}),key))}catch(e){answers[c.id]='';console.error(c.id,e.message)}
   process.stdout.write('.');await new Promise(r=>setTimeout(r,1500));
  }
  const file=new URL(`answers-${legacy?'legacy-':''}${new Date().toISOString().replace(/[:.]/g,'-')}.json`,out);writeFileSync(file,JSON.stringify(answers,null,1));console.log('\n'+file.pathname);
  console.log(JSON.stringify({...report(answers),rows:undefined}));return;
 }
 if(cmd==='grade'){
  const r=report(JSON.parse(readFileSync(rest[0])));
  const b=rest.includes('--baseline')?report(JSON.parse(readFileSync(rest[rest.indexOf('--baseline')+1]))):null;
  console.log(`总分 ${r.total}${b?`（基线 ${b.total}）`:''}`);for(const [k,v] of Object.entries(r.categories))console.log(`${k} ${v}${b?`（基线 ${b.categories[k]}）`:''}`);
  for(const row of r.rows.filter(x=>x.failed.length))console.log(row.id,row.failed.join(' '));
  if(r.unanswered.length)console.log('未作答',r.unanswered.join(','));return;
 }
 console.log('用法：prompts | run [--only id,...] | grade <answers.json> [--baseline <file>]');
}
if(import.meta.url===`file://${process.argv[1]}`)main().catch(e=>{console.error(e.message);process.exit(1)});
