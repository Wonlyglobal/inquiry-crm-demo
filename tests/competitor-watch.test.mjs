import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {watchList,newsPages,headlines,quoteStillThere,runWatch,intelIntent,intelAnswer,readTranslations,rotate} from '../supabase/functions/agent-conversation/competitor-watch.mjs';
const ev=[{id:'a1',company:'ACME（阿联酋）',source_url:'https://acme.ae/products/fire',quote:'Fire Rated up to 4 Hours',value:'耐火4小时'}];
const home='<a href="/news">News</a><a href="https://evil.com/news">x</a>';
const news='<ul><li>12 Sep 2026 <a href="/news/2026/new-fire-door-line">ACME launches a new UL fire door line for Riyadh</a></li><li><a href="/news/old">Read more</a></li></ul>';
const fake=pages=>async url=>{const body=pages[url];if(body==null)return {ok:false,status:404,url};return {ok:true,url,arrayBuffer:async()=>new TextEncoder().encode(body).buffer}};
test('reads only the official site: news list, headlines with dates, quote checks',async()=>{
 assert.deepEqual(watchList(ev)[0].origins,['https://acme.ae']);assert.deepEqual(rotate([1,2,3],2,2),[3,1]);
 assert.deepEqual(newsPages(home,'https://acme.ae/'),['https://acme.ae/news']);
 const h=headlines(news,'https://acme.ae/news');assert.equal(h.length,1);assert.equal(h[0].published_on,'2026-09-12');
 assert.equal(quoteStillThere('<p>Fire  Rated up to 4 Hours!</p>','Fire Rated up to 4 Hours'),true);assert.equal(quoteStillThere('<p>Fire rated up to 3 hours</p>','Fire Rated up to 4 Hours'),false);
 const r=await runWatch({evidence:ev,known:new Set(),fetcher:fake({'https://acme.ae/':home,'https://acme.ae/news':news,'https://acme.ae/products/fire':'<p>Fire rated up to 3 hours</p>'}),now:Date.parse('2026-10-01')});
 assert.deepEqual(r.items.map(i=>i.kind).sort(),['evidence_changed','news']);assert.equal(r.sourcesOk,1);assert.equal(r.evidenceChecked,1);
 const again=await runWatch({evidence:ev,known:new Set(['news|https://acme.ae/news/2026/new-fire-door-line','evidence_changed|https://acme.ae/products/fire']),fetcher:fake({'https://acme.ae/':home,'https://acme.ae/news':news,'https://acme.ae/products/fire':'x'}),now:Date.parse('2026-10-01')});
 assert.equal(again.items.length,0);
});
test('Grace report: intent, refresh, honest wording',()=>{
 assert.deepEqual(intelIntent('汇报一下竞品最新动态'),{refresh:false});assert.deepEqual(intelIntent('刷新竞品情报'),{refresh:true});assert.equal(intelIntent('王力防盗门参数'),null);
 assert.match(intelAnswer(null),/还没有运行过/);
 const a=intelAnswer({last_run:{started_at:'2026-10-01T01:17:00Z',sources_ok:18,sources_failed:2,evidence_checked:40},items:[{company:'ACME',kind:'news',title:'ACME launches',title_zh:'ACME 发布',url:'https://acme.ae/n',published_on:'2026-09-12'},{company:'ACME',kind:'evidence_changed',title:'官方页面上已找不到这条原文：耐火4小时',url:'https://acme.ae/p'}]});
 assert.match(a,/ACME 发布（原文：ACME launches）/);assert.match(a,/证据变化 1 条/);assert.match(a,/还没有人工核验/);
 assert.deepEqual(readTranslations({choices:[{message:{content:'["一","二"]'}}]},2),['一','二']);assert.equal(readTranslations({choices:[{message:{content:'oops'}}]},2),null);
 const src=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');assert.match(src,/verify_competitor_watch_secret/);
});
