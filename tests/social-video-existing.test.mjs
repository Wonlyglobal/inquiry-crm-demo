import test from 'node:test';import assert from 'node:assert/strict';
import {existingVideoIntent,existingVideoPage,loadExistingVideoIndex,existingVideoAnalysis,videoEditingSignals} from '../supabase/functions/agent-conversation/social-video-existing.mjs';
import {readPrivateIntelligence,privateIntelligenceIntent} from '../supabase/functions/agent-conversation/private-intelligence.mjs';
import {privateReportQuestion} from '../assets/agent-private-report-context.mjs';
const now=Date.parse('2026-10-23T06:00:00Z'),iso=new Date(now).toISOString(),id='11111111-1111-4111-8111-111111111111';
function doc(){return {kind:'facebook',key:'facebook-2026-10-23',period:{from:'2026-10-23',to:'2026-10-23'},sections:[{title:'来源日期与覆盖',body:JSON.stringify({platform:'facebook',status:'available',source_date:'2026-10-23T02:00:00Z',saved_posts:1})},{title:'已发布逐帖明细 1/1',body:'https://www.facebook.com/reel/123/\n发布：2026-10-22T01:00:00Z；views=12；likes=1；comments=0'}]}}
function envelope(page=1){return {status:'available',scope:'authorized_material_library',page,read_at:iso,has_more:true,assets:page===2?[]:[{id,name:'SYNTHETIC VIDEO',type:'视频',isCurrentVersion:true,updatedAt:'2026-10-22T01:00:00Z',video:{status:'ready',coverage:{audio:'transcribed',frame_count:1,visual_failed_frames:0},segments:[{kind:'speech',start:0,end:4,text:'Synthetic question crossing three seconds'},{kind:'visual_inference',start:2,end:2,text:'Synthetic door operation'},{kind:'screen_text',start:2,end:2,text:'Synthetic packaging words'}]}},{id:'22222222-2222-4222-8222-222222222222',type:'文档',name:'UNRELATED_DOCUMENT',document:{secret:'DO_NOT_PROPAGATE'}}]}}
async function config(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {actor:'c43bd3c2-6e3a-4228-99c7-dc95f33643f2',privateJwk:JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey)),secret:'fixture',serviceUrl:'https://file.foreverdoodle.com:8088/'}}
test('video route and explicit report context never become text analysis or external model memory',async()=>{
 for(const q of ['分析今天Facebook视频前三秒画面、口播和字幕','分析今天Ｉｎｓｔａｇｒａｍ视频','查看私有知识 facebook-2026-10-23，视频证据']){assert.equal(existingVideoIntent(q),true);assert.equal(privateIntelligenceIntent(q),true)}
 for(const q of ['视频证据','画面怎么改','口播怎么改','字幕怎么改'])assert.equal(privateReportQuestion(q,'facebook-2026-10-23'),`查看私有知识 facebook-2026-10-23，${q}`);
 let called=0;const client={rpc:async()=>({data:{documents:[{id:'receipt',digest:'same',document:doc()}]}})};
 const r=await readPrivateIntelligence(client,'分析今天Facebook视频前三秒和开头表达',now,{authorization:'fixture',fetcher:async()=>{called++;throw Error('not called without material config')}});
 assert.equal(called,0);assert.match(r.answer,/视频索引本次读取失败/);assert.doesNotMatch(r.answer,/文案开头草案/);assert.equal(r.receipts[0].digest,'same');
});
test('existing signed query reads two bounded pages, preserves original timestamps and filters all documents/credentials',async()=>{
 const calls=[];const c=await config(),r=await loadExistingVideoIndex(c,'',async(u,o)=>{assert.equal(u,'https://file.foreverdoodle.com:8088/api/integrations/crm/knowledge');assert.equal(o.redirect,'error');assert.ok(o.headers['X-CRM-Proof']);const b=JSON.parse(o.body);calls.push(b);assert.deepEqual(Object.keys(b).sort(),['catalogue','page','query','terms']);assert.equal(b.query,'');assert.deepEqual(b.terms,[]);return Response.json(envelope(b.page))},now);
 assert.deepEqual(calls.map(b=>b.page).sort(),[1,2]);assert.equal(r.videos.length,1);assert.equal(r.videos[0].segments[0].end,4);assert.equal(r.videos[0].read_at,iso);assert.equal(r.digest.length,64);assert.doesNotMatch(JSON.stringify(r),/UNRELATED_DOCUMENT|DO_NOT_PROPAGATE|fixture|privateJwk/);
 for(const url of ['http://file.foreverdoodle.com','https://evil.test','https://u:p@file.foreverdoodle.com','https://file.foreverdoodle.com:123']){assert.equal((await loadExistingVideoIndex({...c,serviceUrl:url},'',async()=>{throw Error('must not fetch')},now)).status,'unavailable')}
});
test('malformed, expired, oversized and failed pages do not become fresh or full indexes; duplicates conflict instead of being guessed',async()=>{
 const c=await config();for(const mutate of [d=>d.scope='other',d=>d.page=99,d=>d.read_at='2026-10-01',d=>d.read_at='2099-01-01',d=>d.assets=Array(21).fill(d.assets[0])]){const r=await loadExistingVideoIndex(c,'',async(u,o)=>{const d=envelope(JSON.parse(o.body).page);mutate(d);return Response.json(d)},now);assert.equal(r.status,'unavailable');assert.equal(r.read_at,null)}
 const large=await loadExistingVideoIndex(c,'',async()=>new Response('x'.repeat(1048577)),now);assert.equal(large.status,'unavailable');
 const partial=await loadExistingVideoIndex(c,'',async(u,o)=>JSON.parse(o.body).page===1?Response.json(envelope()):new Response('',{status:503}),now);assert.equal(partial.status,'available');assert.equal(partial.pages[1].status,'unavailable');assert.equal(partial.pages[1].reason,'http_503');
 const duplicate=await loadExistingVideoIndex(c,'',async(u,o)=>{const p=JSON.parse(o.body).page,d=envelope(1);d.page=p;d.assets[0].name+=' '+p;return Response.json(d)},now);assert.equal(duplicate.videos.length,0);assert.equal(duplicate.conflicts,1);
 assert.equal(existingVideoPage('物料第999页'),20);assert.equal(existingVideoPage('物料第0页'),1);
});
test('actual observation and timestamp-specific suggestions remain separate from post pairing and missing retention',async()=>{
 const d=doc(),before=JSON.stringify(d),r=await loadExistingVideoIndex(await config(),'',async(u,o)=>Response.json(envelope(JSON.parse(o.body).page)),now),answer=existingVideoAnalysis(d,r,'',now);
 for(const pattern of [/观看：12/,/观看量指标覆盖：1\/1/,/帖子发布窗口：未知 至 未知/,/来源最近成功：未知/,/2\.00秒 采样推测/,/0\.00秒—4\.00秒 转写待听校/,/不等于已确认字幕/,/没有连续0—3秒覆盖证明/,/画面改法/,/口播改法/,/字幕改法/,/尚不能认定它们对应上述任何原帖/,/解析完成时间\/源文件哈希：接口未提供/,/不是源视频文件哈希/,/24小时\/72小时/,/没有自动保存新知识/])assert.match(answer,pattern);
 assert.equal(JSON.stringify(d),before);assert.doesNotMatch(answer,/已配对|内容导致|已提高转化|已经同步视频/);
 r.videos[0].segments=[];assert.match(existingVideoAnalysis(d,r,'',now),/没有可分析/);
});

test('editing signals use only observed segment units, endpoints and explicit gaps',()=>{
 const notes=videoEditingSignals({segments:[{kind:'speech',start:0,end:2,text:'Actually this is a synthetic sequence with many separate words and you know additional details'},{kind:'screen_text',start:5,end:5,text:'Synthetic caption words only'},{kind:'visual_inference',start:8,end:8,text:'Synthetic action'}]}).join('\n');
 assert.match(notes,/0\.00秒—2\.00秒/);assert.match(notes,/字词单位/);assert.match(notes,/口头衔接词/);assert.match(notes,/ASR段字词单位较密/);assert.match(notes,/已有画面采样均在3秒之后/);assert.doesNotMatch(notes,/前三秒留存提高|已确认字幕/);
 const missing=videoEditingSignals({segments:[{kind:'speech',start:0,end:null,text:'Synthetic unknown duration'}]}).join('\n');assert.match(missing,/暂不估算语速/);assert.match(missing,/缺少字幕候选/);assert.doesNotMatch(missing,/单位\/秒/);
});
