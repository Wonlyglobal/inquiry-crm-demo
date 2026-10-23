import test from 'node:test';import assert from 'node:assert/strict';
import {validateVideoEvidence,privateSocialVideoAnalysis,socialVideoIntent,loadSocialVideoEvidence,SOCIAL_VIDEO_SCHEMA} from '../supabase/functions/agent-conversation/social-video.mjs';
import {privateIntelligenceIntent,readPrivateIntelligence} from '../supabase/functions/agent-conversation/private-intelligence.mjs';
import {privateReportQuestion} from '../assets/agent-private-report-context.mjs';
const now=Date.parse('2026-10-23T05:00:00Z'),pub='2026-10-22T01:00:00Z',asset='11111111-1111-4111-8111-111111111111',binding='22222222-2222-4222-8222-222222222222',sha='a'.repeat(64),frame='b'.repeat(64),url='https://www.facebook.com/reel/123/';
function document(){return {kind:'facebook',key:'facebook-2026-10-23',period:{from:'2026-10-23',to:'2026-10-23'},sections:[{title:'来源日期与覆盖',body:JSON.stringify({platform:'facebook',status:'available',source_date:'2026-10-23T02:00:00Z',saved_posts:1,post_coverage_complete:true})},{title:'已发布逐帖明细 1/1',body:`${url}\n发布：${pub}；views=12；likes=1；comments=0`}]}}
function envelope(){return {schema_version:SOCIAL_VIDEO_SCHEMA,scope:'authorized_wonly_published_video',read_at:new Date(now).toISOString(),posts:[{platform:'facebook',url,published_at:pub,asset_id:asset,source_sha256:sha,index_sha256:sha,duration:8,parsed_at:'2026-10-23T04:00:00Z',parser_version:'opening-evidence-v2',status:'ready',binding:{id:binding,method:'publisher_receipt',post_identity:'facebook:123',asset_id:asset,source_sha256:sha,verified_at:'2026-10-23T04:00:00Z'},coverage:{sample_times:[0,1,2,2.9,4],audio:'transcribed',screen_text:'sampled_ocr',visual_failed_frames:0,ocr_failed_frames:0},segments:[...[0,1,2,2.9].map(start=>({kind:'visual_inference',start,end:start,text:'Synthetic visible door action',frame_sha256:frame})),{kind:'speech',start:0,end:2,text:'Synthetic operating question'},{kind:'speech',start:2,end:5,text:'Synthetic sentence crossing three seconds'},{kind:'screen_text',start:1,end:1,text:'Synthetic screen words that may be packaging and are not necessarily subtitles',frame_sha256:frame}]}]}}
test('video questions and short followups use private metrics, never caption or model fallback',async()=>{
 for(const q of ['分析今天Facebook视频前三秒画面、口播和字幕','分析今天Ｉｎｓｔａｇｒａｍ视频并给出建议','查看私有知识 youtube-2026-10-23，视频前三秒']){assert.equal(socialVideoIntent(q),true);assert.equal(privateIntelligenceIntent(q),true)}
 for(const q of ['视频前三秒','画面怎么改','口播怎么改','字幕怎么改'])assert.equal(privateReportQuestion(q,'facebook-2026-10-23'),`查看私有知识 facebook-2026-10-23，${q}`);
 const result=await readPrivateIntelligence({rpc:async()=>({data:{documents:[{id:'receipt',digest:'saved-sha',document:document()}]}})},'分析今天Facebook视频前三秒并给出开头建议',now,{authorization:'fixture',fetcher:async()=>{throw Error('must not fetch captions or unconfigured video source')}});
 assert.match(result.answer,/视频证据尚未接通/);assert.doesNotMatch(result.answer,/文案开头草案/);assert.equal(result.receipts[0].id,'receipt');
});
test('version, exact binding, timestamps, hash and duplicates fail closed',()=>{
 assert.equal(validateVideoEvidence(envelope(),now).posts.length,1);
 const edits=[p=>p.source_sha256='c'.repeat(64),p=>p.binding.post_identity='facebook:999',p=>p.binding.method='title_similarity',p=>p.asset_id='other',p=>p.duration=Infinity,p=>p.parsed_at='2099-01-01',p=>p.binding.verified_at='2099-01-01',p=>p.parser_version='legacy',p=>p.segments[0].frame_sha256='missing',p=>p.segments[0].start=-1,p=>p.segments[4].end=99,p=>p.coverage.sample_times=[NaN]];
 for(const edit of edits){const input=envelope();edit(input.posts[0]);assert.equal(validateVideoEvidence(input,now).posts.length,0)}
 const duplicate=envelope();duplicate.posts.push(structuredClone(duplicate.posts[0]));assert.equal(validateVideoEvidence(duplicate,now).posts.length,0);
 const legacy=envelope();legacy.schema_version='ordinary-material-index';assert.equal(validateVideoEvidence(legacy,now).status,'unavailable');
});
test('timecoded observations, cross-boundary ASR and OCR candidates remain separate from causal advice',()=>{
 const doc=document(),before=JSON.stringify(doc),result=privateSocialVideoAnalysis(doc,validateVideoEvidence(envelope(),now),now);
 for(const text of [/配对覆盖：1\/1/,/0\.00秒 机器描述/,/0\.00秒—2\.00秒 ASR/,/2\.00秒—5\.00秒/,/不能确定哪些词落在前三秒/,/OCR只是字幕候选/,/可能包含产品包装/,/无坐标\/字号证据/,/24小时\/72小时/,/留存曲线/,/累计观看：12/,/文件SHA-256/])assert.match(result,text);
 assert.equal(JSON.stringify(doc),before);assert.doesNotMatch(result,/已提高|导致观看|字幕准确率为|已确认字幕/);
});
test('missing early frames, unknown speech, date mismatch and old metrics do not become negative video conclusions',()=>{
 let e=envelope();e.posts[0].segments=e.posts[0].segments.filter(s=>s.kind==='screen_text');e.posts[0].coverage.audio='not_processed';const text=privateSocialVideoAnalysis(document(),validateVideoEvidence(e,now),now);assert.match(text,/开头关键采样不完整/);assert.match(text,/不能认定无口播/);assert.match(text,/口播建议暂缓/);
 e=envelope();e.posts[0].published_at='2026-10-21';assert.match(privateSocialVideoAnalysis(document(),validateVideoEvidence(e,now),now),/配对覆盖：0\/1/);
 const doc=document(),m=JSON.parse(doc.sections[0].body);m.source_date='2026-10-01';doc.sections[0].body=JSON.stringify(m);assert.match(privateSocialVideoAnalysis(doc,validateVideoEvidence(envelope(),now),now),/暂缓当前视频/);
});
test('signed reader is opt-in, bounded and fixed to the company material route; wrong response has no fallback',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({status:'available',assets:[]})};
 assert.equal((await loadSocialVideoEvidence({},[document()],fetcher,now)).status,'unavailable');assert.equal(calls,0);
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
 const config={policy:'company-social-video-v1',actor:'c43bd3c2-6e3a-4228-99c7-dc95f33643f2',privateJwk:JSON.stringify(privateJwk),secret:'fixture',serviceUrl:'https://evil.test/'};
 assert.equal((await loadSocialVideoEvidence(config,[document()],fetcher,now)).status,'unavailable');assert.equal(calls,0);
 config.serviceUrl='https://file.foreverdoodle.com:8088/';
 const r=await loadSocialVideoEvidence(config,[document()],async(u,o)=>{calls++;assert.equal(u,'https://file.foreverdoodle.com:8088/api/integrations/crm/knowledge');assert.equal(o.redirect,'error');assert.ok(o.headers['X-CRM-Proof']);const body=JSON.parse(o.body);assert.deepEqual(Object.keys(body).sort(),['operation','posts']);assert.doesNotMatch(o.body,/views|likes|source_sha256|caption/);return Response.json(envelope())},now);
 assert.equal(r.posts.length,1);assert.equal(calls,1);
 assert.equal((await loadSocialVideoEvidence(config,[document()],fetcher,now)).status,'unavailable');assert.equal(calls,2);
});
