import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadSocialLibrary} from '../supabase/functions/agent-conversation/social.mjs';
const response=(page,total=37)=>new Response(JSON.stringify({status:'available',page,total_records:total,posts:Array.from({length:Math.max(0,Math.min(20,total-(page-1)*20))},(_,i)=>({platform:'youtube',url:`https://www.youtube.com/watch?v=v${(page-1)*20+i}`,content:'x'.repeat(1500),metrics:{views:null}}))}));
test('library reads beyond first page and bounds excerpts without claiming video analysis',async()=>{const called=[];const x=await loadSocialLibrary('test',async u=>{const p=Number(new URL(u).searchParams.get('posts_page'));called.push(p);return response(p)});assert.deepEqual(called,[1,2]);assert.equal(x.records_read,37);assert.deepEqual(x.platform_counts,{youtube:37});assert.equal(x.all_stored_records_read,true);assert.equal(x.posts[0].content.length,1200);assert.equal(x.posts[0].content_truncated,true);assert.equal(x.posts[0].metrics.views,null)});
test('failed page and changing total never claim complete library',async()=>{for(const changing of [false,true]){const x=await loadSocialLibrary('test',async u=>{const p=Number(new URL(u).searchParams.get('posts_page'));return p===1?response(1):changing?response(2,38):new Response('{}',{status:503})});assert.equal(x.status,'partial');assert.equal(x.records_read,20);assert.equal(x.all_stored_records_read,false)}});
test('library caps reads at 100 and rejects duplicate public links as complete coverage',async()=>{let calls=0;const x=await loadSocialLibrary('test',async u=>{calls++;return response(Number(new URL(u).searchParams.get('posts_page')),140)});assert.equal(calls,5);assert.equal(x.records_read,100);assert.equal(x.status,'partial');const y=await loadSocialLibrary('test',async u=>{const p=Number(new URL(u).searchParams.get('posts_page'));const d=await response(p).json();if(p===2)d.posts[0].url='https://www.youtube.com/watch?v=v0';return Response.json(d)});assert.equal(y.records_read,36);assert.equal(y.all_stored_records_read,false)});

test('chat only applies single-page context when the user explicitly requests a page',async()=>{
 const edge=await readFile(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.match(edge,/const explicitSocialPage=\/\(\?:社媒\|帖子\|内容\).*?第\\s\*\\d\{1,4\}\\s\*页\//);
 assert.match(edge,/route\.social&&explicitSocialPage\?loadSocialPosts\(authorization,requestedPostPage\(input\.question\)\):Promise\.resolve\(skipped\)/);
});

import {socialContextLabel} from '../assets/agent-seo-status.mjs';
import {safeMarketingFallback} from '../supabase/functions/agent-conversation/answer-quality.mjs';
test('coverage footer uses server counts and marks partial reads',()=>{const t=socialContextLabel({social_status:'available',social_library_status:'partial',social_library_records:20,social_library_total:37});assert.match(t,/20 \/ 37/);assert.match(t,/读取不完整/);assert.match(t,/不代表平台全部/)});

test('platform footer shows computed counts and excludes unexpected fields',()=>{const t=socialContextLabel({social_status:'available',social_library_platforms:{youtube:6,tiktok:26,other:5,secret:1}});assert.match(t,/youtube 6条、tiktok 26条、other 5条/);assert.doesNotMatch(t,/secret/)});

test('social safety fallback analyzes requested monthly publishing volume and states performance-data limits',()=>{
 const t=safeMarketingFallback({question:'给9月和8月的社媒情况做个总结',social:{status:'available',published_28d:[{metric_status:'recorded_not_verified'}]},socialLibrary:{status:'available',records_read:3,total_records:3,posts:[
  {platform:'tiktok',published_at:'2026-09-10T00:00:00Z',title:'Smart lock launch'},
  {platform:'tiktok',published_at:'2026-09-20T00:00:00Z',title:'Door design guide'},
  {platform:'youtube',published_at:'2026-08-20T00:00:00Z',title:'Installation demo'}
 ]}});
 assert.match(t,/2026-09：2 条已入库发布记录（tiktok 2条）/);
 assert.match(t,/2026-08：1 条已入库发布记录（youtube 1条）/);
 assert.match(t,/增加 1 条（100%）/);
 assert.match(t,/未核验/);
 assert.match(t,/不能据此比较9月\/8月互动增长/);
 assert.doesNotMatch(t,/模型分析未通过事实检查/);
});
