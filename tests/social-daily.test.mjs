import test from 'node:test';import assert from 'node:assert/strict';
import {livePlatforms} from '../integrations/social-summary/supabase/functions/social-summary/live-platforms.mjs';
import {socialDailyDocuments,socialDailyMetadata,syncDailySocial} from '../supabase/functions/agent-conversation/social-daily.mjs';
import {socialMetrics} from '../supabase/functions/agent-conversation/source-metrics.mjs';
import {loadSocialMetrics} from '../supabase/functions/agent-conversation/social.mjs';
import {privateIntelligenceIntent,privateIntelligenceQuery} from '../supabase/functions/agent-conversation/private-intelligence.mjs';
import {validPrivateReceipt,privateReceiptLabel} from '../assets/agent-private-intelligence.mjs';
const now=Date.parse('2026-10-22T09:00:00Z'),date=new Date(now),json=Response.json;
const defaults={get:()=>null,accounts:[],tiktokToken:async()=>null,now:date,metricsOnly:true};
test('TikTok metrics mode follows pages beyond 20 and removes out-of-window detail',async()=>{
 let pages=0;const r=await livePlatforms({...defaults,accounts:[{platform:'tiktok',external_id:'owner'}],tiktokToken:async()=>({access_token:'fixture',expires_at:'2026-10-23'}),fetcher:async(url,opts)=>{if(url.includes('user/info'))return json({data:{user:{open_id:'owner'}}});pages++;assert.doesNotMatch(url,/,title,/);return json({data:{videos:Array.from({length:20},(_,i)=>({share_url:`https://www.tiktok.com/@wonlyglobal/video/${pages*100+i}`,create_time:Math.floor((now-(pages===2&&i>=5?40:2)*86400000)/1000),view_count:0})),has_more:true,cursor:pages*20},error:{code:'ok'}})}});
 assert.equal(pages,2);assert.equal(r.tiktok.posts.length,25);assert.equal(r.tiktok.details_complete,true);assert.equal(r.tiktok.has_more,true);assert.ok(!('content' in r.tiktok.posts[0]));
 const p=socialMetrics({status:'available',live_platforms:r},null,now).platforms[0];assert.equal(p.complete,true);assert.equal(p.posts[0].metrics.views,0);
});
test('Instagram metrics mode reads every returned window post with bounded insight concurrency',async()=>{
 let running=0,max=0;const r=await livePlatforms({...defaults,get:k=>({IG_ACCESS_TOKEN:'fixture',IG_BUSINESS_ID:'123'})[k],accounts:[{platform:'instagram',external_id:'123'}],fetcher:async url=>{
 if(url.includes('/media?')){assert.doesNotMatch(url,/caption/);return json({data:Array.from({length:18},(_,i)=>({id:String(i+1),permalink:`https://www.instagram.com/reel/Post${i}/`,timestamp:'2026-10-20',like_count:0}))})}
 if(url.includes('/insights?')){running++;max=Math.max(max,running);await new Promise(r=>setTimeout(r,1));running--;return json({data:[{name:'views',values:[{value:0}]}]})}return json({followers_count:0})}});
 assert.equal(r.instagram.posts.length,18);assert.equal(r.instagram.details_complete,true);assert.ok(max<=4);assert.equal(r.instagram.posts[0].metric_errors.reach,'not_returned');assert.equal(r.facebook.status,'not_requested');
});
test('metrics reader rejects old schema, failed reads and oversized responses without exposing auth',async()=>{for(const result of [json({schema_version:'1.0'}),json({error:'fixture'},{status:403}),new Response('x'.repeat(262145))])assert.equal((await loadSocialMetrics('fixture',async()=>result)).status,'unavailable')});
const source={status:'available',generated_at:date.toISOString(),live_platforms:{tiktok:{status:'available',fetched_at:date.toISOString(),has_more:true,details_complete:true,window:{start:'2026-09-24T09:00:00Z',end:date.toISOString(),complete:true},posts:[{url:'https://www.tiktok.com/@wonlyglobal/video/123',published_at:'2026-10-21',metrics:{views:0,likes:1}}]},instagram:{status:'unavailable',reason:'permission_required'}}};
test('private per-platform snapshots preserve failures, zero, null, dates and prior successful source time',async()=>{
 const previous=[{id:'prior',document:{kind:'instagram',sections:[{title:'来源日期与覆盖',body:JSON.stringify({status:'available',source_last_success_sync:'2026-10-21T01:00:00Z'})}]}}];
 const docs=await socialDailyDocuments(source,previous,now);assert.equal(docs.length,2);assert.equal(docs[0].key,'tiktok-2026-10-22');assert.match(docs[0].sections[1].body,/views=0/);assert.match(docs[0].sections[1].body,/未列出的指标一律未知/);assert.equal(socialDailyMetadata({document:docs[1]}).source_last_success_sync,'2026-10-21T01:00:00Z');assert.equal(socialDailyMetadata({document:docs[1]}).last_successful_knowledge_id,'prior');assert.ok(docs.every(d=>d.sections.length<=8&&d.sections.every(s=>s.body.length<=3000)));
 assert.equal(privateIntelligenceIntent('查看今天已同步的TikTok指标'),true);assert.equal(privateIntelligenceQuery('查看今天已同步的Instagram指标',now).p_kind,'instagram');assert.equal(privateReceiptLabel(docs[0].key),'TikTok逐帖 · 2026-10-22');assert.ok(validPrivateReceipt({id:'11111111-1111-4111-8111-111111111111',key:docs[1].key,digest:'a'.repeat(64)}));
});
test('private sync verifies persisted document content as well as receipts, without automatic write retry',async()=>{
 let docs=[],writes=0;const receipts=['tiktok','instagram'].map((p,i)=>({id:`11111111-1111-4111-8111-11111111111${i}`,key:p+'-2026-10-22',digest:String(i).repeat(64)}));
 const client={rpc:async(name,args)=>{if(name==='sync_agent_private_intelligence'){docs=args.p_documents;writes++;return {data:{receipts}}}if(name==='receipt_agent_private_intelligence')return {data:{receipt:receipts.find(x=>x.id===args.p_id)}};return {data:{documents:args.p_key?[{...receipts.find(x=>x.key===args.p_key),document:docs.find(d=>d.key===args.p_key)}]:[]}}}};
 const result=await syncDailySocial({client,authorization:'fixture',now,fetcher:async()=>json({...source,schema_version:'wonly-social-metrics-v1',site:'socialwonly.foreverdoodle.com'})});assert.equal(result.verified,true);assert.equal(writes,1);
 const tampered={rpc:async(name,args)=>{const result=await client.rpc(name,args);if(name==='read_agent_private_intelligence'&&args.p_key){const copy=structuredClone(result);copy.data.documents[0].document.sections[0].body='changed after save';return copy}return result}};
 await assert.rejects(()=>syncDailySocial({client:tampered,authorization:'fixture',now,fetcher:async()=>json({...source,schema_version:'wonly-social-metrics-v1',site:'socialwonly.foreverdoodle.com'})}),/内容回读/);assert.equal(writes,2);
 const bad={rpc:async(name,args)=>name==='receipt_agent_private_intelligence'?{data:{receipt:{digest:'wrong'}}}:client.rpc(name,args)};await assert.rejects(()=>syncDailySocial({client:bad,authorization:'fixture',now,fetcher:async()=>json({...source,schema_version:'wonly-social-metrics-v1',site:'socialwonly.foreverdoodle.com'})}),/回执/);assert.equal(writes,3);
});
