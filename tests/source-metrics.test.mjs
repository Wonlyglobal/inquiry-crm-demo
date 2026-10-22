import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceMetricsIntent,socialMetrics,sourceMetricsAnswer} from '../supabase/functions/agent-conversation/source-metrics.mjs';
import {seoSummary} from '../supabase/functions/agent-conversation/seo.mjs';
const now=Date.parse('2026-10-22T02:00:00Z'), at='2026-10-22T01:00:00Z';
const post={url:'https://www.instagram.com/p/public/?utm_source=tracking',published_at:'2026-10-20T00:00:00Z',content:'private-body',operator_email:'private@example.com',metrics:{likes:0,views:null,saved:2}};
const live={status:'available',generated_at:at,live_platforms:{instagram:{status:'available',fetched_at:at,has_more:false,posts:[post]}}};
const library={status:'available',records_read:2,total_records:2,all_stored_records_read:true,posts:[{...post,platform:'instagram'},{platform:'linkedin',url:'https://www.linkedin.com/posts/secret',metrics:{views:100}}]};
test('official single-post fetch dates stay separate from unverified stored figures and unknown is not zero',()=>{
 const x=socialMetrics(live,library,now),ig=x.platforms.find(p=>p.platform==='instagram');
 assert.equal(ig.status,'available');assert.equal(ig.posts[0].metrics.likes,0);assert.equal(ig.posts[0].metrics.views,null);assert.equal(ig.posts[0].metrics.saves,2);assert.equal(ig.posts[0].metrics_synced_at,at);
 assert.equal(x.stored.posts.length,1);assert.equal(x.stored.posts[0].metrics_synced_at,null);assert.equal(x.stored.posts[0].metric_status,'recorded_not_verified');
 assert.doesNotMatch(JSON.stringify(x),/private-body|private@example|tracking|linkedin.com/);
 const answer=sourceMetricsAnswer({},x);assert.match(answer,/观看\/播放 未知/);assert.match(answer,/点赞 0/);assert.match(answer,/尚未写入私有知识库/);
});
test('failed, partial, malformed and future-dated platform responses never become complete successes',()=>{
 for(const mutation of [{fetched_at:'2026-10-23T00:00:00Z'},{posts:[post,{...post,url:'https://evil.test/x'}]},{has_more:true},{window:{complete:false,stop_reason:'permission_required'}},{posts:[post,post]}]){
  const x=socialMetrics({...live,live_platforms:{instagram:{...live.live_platforms.instagram,...mutation}}},library,now);assert.notEqual(x.platforms[1].status,'available');assert.equal(x.platforms[1].complete,false);
 }
 const x=socialMetrics({status:'unavailable',live_platforms:live.live_platforms},null,now);assert.equal(x.platforms[1].posts.length,0);assert.equal(x.stored.source_total,null);
});
test('metrics query dispatch cannot be mistaken for source-status, publishing or a private report import',()=>{
 for(const q of ['查看社媒逐帖指标','给我TikTok每帖观看量','查询竞品SEO流量和关键词','竞品SEMrush指标'])assert.ok(sourceMetricsIntent(q),q);
 for(const q of ['SEO和社媒接入状态与数据日期','发布社媒帖子','删除帖子','查看上周周报'])assert.equal(sourceMetricsIntent(q),false,q);
 const source=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 const branch=source.slice(source.indexOf('if(!guest&&sourceMetricsIntent'),source.indexOf('if(!guest&&sourceStatusIntent'));
 assert.match(branch,/loadSocialLibrary\(authorization\)/);assert.match(branch,/provider:'internal'/);assert.doesNotMatch(branch,/CHAT_URL|requestBody|storeMemory|sync_agent_private_intelligence/);
 assert.match(source,/if\(!eligible\(user,profile\)\)/);
});
const seo={schema_version:'1.0',site:'wonlyglobal.com',generated_at:at,competitors:['hormann.com'],competitor_metrics:[{domain:'hormann.com',source_type:'authorized_export',estimated:true,database:'us',device:'desktop',period:{start:'2026-09-01',end:'2026-09-30'},captured_at:'2026-10-21',organic_traffic:0,organic_keywords:50,keywords:[{query:'front door',position:3,previous_position:8}],top_pages:[{url:'https://hormann.com/products/',traffic:12}]}]};
test('authorized competitor snapshots retain scope and estimates, reject unknown provenance and invalid dates',()=>{
 const x=seoSummary(seo,now);assert.equal(x.competitor_metrics[0].organic_traffic,0);assert.equal(x.competitor_metrics[0].backlinks,null);assert.equal(x.competitor_metrics[0].keywords[0].previous_position,8);
 for(const bad of [{domain:'evil.com'},{estimated:false},{source_type:'moptools_scrape'},{database:''},{device:'all'},{captured_at:'2026-02-30'},{captured_at:'2026-10-23'}])assert.equal(seoSummary({...seo,competitor_metrics:[{...seo.competitor_metrics[0],...bad}]},now).competitor_metrics.length,0);
 const old=seoSummary({...seo,competitor_metrics:undefined},now);assert.deepEqual(old.competitor_metrics,[]);assert.match(sourceMetricsAnswer(old,socialMetrics({},null,now)),/指标未接通/);
});
