#!/usr/bin/env node
// Grace routing exam (2026-10-03): which path each typical question takes. node scripts/grace-route-exam.mjs prints the table.
// Mirrors the order in agent-conversation/index.ts (client CRM intercept first). Keep in sync when routes change.
const F='../supabase/functions/agent-conversation/';const A='../assets/';
const m=async f=>import(new URL(F+f,import.meta.url));
const {crmDataIntent}=await import(new URL(A+'agent-crm-live.mjs',import.meta.url));
const {courtesyReply}=await m('conversation-style.mjs');const {introIntent}=await m('persona-dialogue.mjs');
const {correctionCommand}=await m('corrections.mjs');const {conversationMemoryCommand}=await m('conversation-memory.mjs');
const {memoryCommand}=await m('memory.mjs');const {feedbackSummaryIntent}=await m('answer-feedback.mjs');
const {intelIntent}=await m('competitor-watch.mjs');const {compareIntent}=await m('wonly-compare.mjs');
const {briefIntent,priceIntent}=await m('competitor-brief.mjs');const {competitorIntent}=await m('public-research.mjs');
const {recordIntent,catalogPageIntent,actionIntent,OPEN_VERB}=await m('agent-actions.mjs');
const {companyLookupIntent}=await m('company-research.mjs');const {catalogPrecheck}=await m('catalog-knowledge.mjs');
const {knowledgeRoute}=await m('knowledge-routing.mjs');const {resolveMaterialTurn}=await m('material-dialogue.mjs');
const {seoIntent}=await m('seo-opportunities.mjs');const {analysisIntent,marketingIntent}=await m('deep-analysis.mjs');
const {specIntent}=await m('catalog-spec.mjs');
export function route(q){
 q=String(q);
 if(crmDataIntent(q))return ['crm_live(本地)',JSON.stringify(crmDataIntent(q))];
 if(courtesyReply(q))return ['courtesy',''];if(introIntent(q))return ['intro',''];
 if(correctionCommand(q))return ['correction',''];if(conversationMemoryCommand(q))return ['conv_memory',''];
 if(memoryCommand(q))return ['memory',''];if(feedbackSummaryIntent(q))return ['feedback',''];
 const intel=intelIntent(q);if(intel)return ['intel',JSON.stringify(intel)];
 const vs=compareIntent(q);if(vs)return ['wonly_compare',JSON.stringify(vs)];
 const br=briefIntent(q);if(br)return ['brief',br.companies.join('|')];
 const pr=priceIntent(q);if(pr)return ['price',JSON.stringify(pr)];
 const comp=competitorIntent(q);
 const rec=recordIntent(q);if(rec)return ['record',JSON.stringify(rec)];
 if(catalogPageIntent(q))return ['catalog_page',''];
 const act=actionIntent(q);if(act||(comp&&OPEN_VERB.test(q)))return ['actions',JSON.stringify(act)];
 if(comp)return ['competitor_evidence',`dim=${comp.dimension} cats=${comp.categories.length} co=${comp.companies.length}`];
 if(companyLookupIntent(q))return ['company_lookup',''];
 if(specIntent(q))return ['catalog_spec',JSON.stringify(specIntent(q))];
 if(catalogPrecheck(q))return ['catalog_qa(画册确定性)',''];
 const t=resolveMaterialTurn(q,[]);const r=knowledgeRoute(t.question,[]);
 const flags=Object.entries(r).filter(([k,v])=>v===true).map(([k])=>k).join(',');
 return ['bailian:'+r.mode,flags+(seoIntent?.(q)?' seo*':'')+(marketingIntent?.(q)?' mkt*':'')+(analysisIntent?.(q)?' deep*':'')];
}

import {pathToFileURL} from 'node:url';
export const EXAM=JSON.parse((await import('node:fs')).readFileSync(new URL('../tests/evals/grace-route-exam.json',import.meta.url),'utf8'));
if(import.meta.url===pathToFileURL(process.argv[1]).href){let ok=0,n=0;for(const c of EXAM){const [r,d]=route(c.q);const pass=new RegExp(c.expect).test(r+" "+d);n++;if(pass)ok++;console.log(`${pass?'OK  ':'FAIL'} [${c.area}] ${c.q} -> ${r} ${String(d).slice(0,80)}${pass?'':'  (expected '+c.expect+')'}`)}console.log(`\n${ok}/${n} passed`)}
