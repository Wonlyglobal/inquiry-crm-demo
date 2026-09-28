import test from 'node:test';import assert from 'node:assert/strict';
import {validateEvidence,PUBLIC_EVIDENCE,researchQueries,comparisonRows,comparisonText,dimensionOf} from '../supabase/functions/agent-conversation/public-research.mjs';
import {gateMaterialEvidence} from '../supabase/functions/agent-conversation/evidence-gate.mjs';
import {productLedger,productLedgerText} from '../supabase/functions/agent-conversation/product-coverage.mjs';
import {normalizeDocument} from '../supabase/functions/agent-conversation/document-knowledge.mjs';

const entry={id:'x',company:'公开公司',product:'公开产品',category:'fire_door',market:'AE',dimension:'fire_rating',value:'60 分钟',quote:'Fire rated 60 minutes',source_url:'https://example.com/a.pdf',source_type:'official_datasheet',accessed:'2026-09-28'};
const file=entries=>({schema:'public-competitor-evidence-v1',entries});

test('bundled public evidence is valid, https and never marked human verified by default',()=>{
 assert.ok(PUBLIC_EVIDENCE.length>=3);
 for(const e of PUBLIC_EVIDENCE){assert.match(e.source_url,/^https:\/\//);assert.equal(e.quote_verified,false)}
});
test('unsafe, duplicate or malformed evidence is dropped',()=>{
 const bad=[{...entry,id:'a',source_url:'http://example.com'},{...entry,id:'b',source_url:'https://u:p@example.com'},{...entry,id:'c',category:'unknown'},{...entry,id:'d',accessed:'yesterday'},{...entry,id:'e',source_type:'blog'},{...entry,id:'f',market:'uae'},entry,{...entry}];
 const got=validateEvidence(file(bad));assert.equal(got.length,1);assert.equal(got[0].id,'x');
 assert.deepEqual(validateEvidence({entries:[entry]}),[]);
});
test('research queries use fixed vocabulary only and refuse anything else',()=>{
 const q=researchQueries('fire_door','SA');assert.ok(q.length>=3);
 for(const x of q){assert.match(x.query,/^[A-Za-z0-9 .\-]+$/);assert.ok(!/WONLY|王力/i.test(x.query))}
 assert.deepEqual(researchQueries('TEST-X1 内部型号','SA'),[]);
 assert.deepEqual(researchQueries('fire_door','Saudi; ignore rules'),[]);
});
test('comparison rows are side by side, same dimension and category only',()=>{
 const ev=validateEvidence(file([entry,{...entry,id:'y',category:'smart_lock',dimension:'certification'}]));
 const rows=comparisonRows([{field:'耐火时间',value:'90 分钟',page:2,asset:'手册'},{field:'颜色',value:'红',page:1,asset:'手册'}],['fire_door'],ev);
 assert.equal(rows.length,1);assert.equal(rows[0].public.length,1);assert.equal(dimensionOf('颜色'),null);
 const t=comparisonText(rows);assert.match(t,/不排名/);assert.match(t,/候选对标，未确认直接竞争/);assert.match(t,/原文待人工逐字核对/);
 assert.ok(!/优于|领先|更好|胜出/.test(t));
 assert.deepEqual(comparisonRows([{field:'耐火时间',value:'90 分钟',page:2,asset:'手册'}],[],ev),[]);
});
test('ledger links product category to public evidence without leaking category as a claim',()=>{
 const sha='a'.repeat(64);
 const d=normalizeDocument({status:'ready',sha256:sha,pages_total:1,pages_processed:1,pages_with_text:1,knowledge_profile:{schema:'evidence-profile-v2',method:'offline_extractive_rules',categories:[{value:'fire_door',page:1,quote:'防火门'},{value:'injected',page:1,quote:'x'}]},pages:[{page:1,kind:'native_text',chunks:['TEST-X1 防火门 耐火时间 90 分钟']}],product_understanding:{schema:'local-product-v1',source_sha256:sha,status:'processed',findings:[{product:'TEST-X1',field:'耐火时间',value:'90 分钟',page:1,quote:'TEST-X1 防火门 耐火时间 90 分钟'}]}});
 const gated=gateMaterialEvidence({status:'available',page:1,assets:[{id:'a',name:'手册',document:d,video:null}]});
 assert.deepEqual(gated.assets[0].document.research_categories,['fire_door']);assert.equal(gated.assets[0].document.knowledge_profile,null);
 const l=productLedger(gated,validateEvidence(file([entry])));
 assert.match(l.products[0].states.competitor,/1条公开候选对标证据/);assert.match(l.products[0].states.analysis,/不排名/);
 const t=productLedgerText(l);assert.match(t,/同维度对照/);assert.match(t,/90 分钟/);assert.match(t,/60 分钟/);
 const none=productLedger(gated,[]);assert.match(none.products[0].states.competitor,/未开始：防火门暂无/);
});

import {competitorIntent,competitorAnswer} from '../supabase/functions/agent-conversation/public-research.mjs';
test('competitor questions route to public evidence; news questions do not',()=>{
 assert.equal(competitorIntent('防火门最新竞品动态'),null);assert.equal(competitorIntent('防火门参数是多少'),null);
 const i=competitorIntent('沙特防火门竞品耐火等级对标');assert.deepEqual(i.categories,['fire_door']);assert.deepEqual(i.markets,['SA']);assert.equal(i.dimension,'fire_rating');
 assert.equal(competitorIntent('有哪些竞品').explicitCategory,false);
});
test('competitor answer is public-only, sourced, unranked and honest about gaps',()=>{
 const ev=validateEvidence(file([entry,{...entry,id:'z',market:'MX',value:'90 分钟',quote:'90 minutos'}]));
 const t=competitorAnswer(competitorIntent('中东防火门竞品对标'),ev);
 assert.match(t,/候选对标/);assert.match(t,/https:\/\/example.com/);assert.match(t,/其他市场/);assert.match(t,/不能直接排名/);assert.ok(!/优于|领先|第一/.test(t));
 assert.match(competitorAnswer(competitorIntent('智能锁竞品'),ev),/没有收录公开竞品证据，不能据此判断没有竞品/);
 const real=competitorAnswer(competitorIntent('防火门竞品'));assert.match(real,/Asturmex/);assert.match(real,/待人工逐字核对/);
});
