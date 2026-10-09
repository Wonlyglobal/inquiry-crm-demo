import test from 'node:test';import assert from 'node:assert/strict';import {createHmac,createHash} from 'node:crypto';
import {seoSummary,seoHeaders,loadSeo} from '../supabase/functions/agent-conversation/seo.mjs';
import {seoContextLabel,socialContextLabel} from '../assets/agent-seo-status.mjs';
const now=Date.parse('2026-09-23T08:00:00Z');
const sample={schema_version:'1.0',site:'wonlyglobal.com',generated_at:'2026-09-23T07:00:00Z',freshness:{ga4:{through:'2026-09-22',lag_days:1,status:'partial'},gsc:{through:'2026-09-20',lag_days:3,status:'ok'},semrush:{through:null,status:'missing'}},windows:{'7d':{gsc:{clicks:0,impressions:50,ctr:0,avg_position:10},ga4:{organic_sessions:8}}},funnel:{organic_7d:{form_open:5,form_start:0}},competitors:['hormann.com']};
test('SEO projection preserves zero, missing, date and channel distinctions; strips unapproved fields',()=>{
 const data=seoSummary({...sample,token:'secret',customer:{email:'private@example.com'},windows:{...sample.windows,'28d':{gsc:{clicks:99},ga4:{organic_sessions:22,client_id:'private'}}},pages:[{path:'/contact?email=private',issues:[]}]},now);
 assert.equal(data.windows['7d'].gsc.clicks,0);assert.equal(data.windows['7d'].gsc.ctr,0);assert.equal(data.windows['28d'].gsc.impressions,null);assert.equal(data.funnel.organic_7d.form_start,0);assert.equal(data.funnel.all_channels_7d.form_start,null);assert.equal(data.freshness.gsc.through,'2026-09-20');assert.equal(data.pages.length,0);assert.doesNotMatch(JSON.stringify(data),/private|secret|client_id/);
});
test('stale and future snapshots cannot masquerade as fresh data',()=>{
 assert.equal(seoSummary(sample,now+3*86400000).status,'stale');assert.throws(()=>seoSummary({...sample,generated_at:'2027-01-01'},now));assert.throws(()=>seoSummary({...sample,site:'other.com'},now));
});
test('HMAC is compatible with source canonical GET signing',async()=>{
 const request={keyId:'crm',secret:'synthetic-test-secret-never-production',pathname:'/seo-summary/v1/current',timestamp:123,nonce:'0123456789abcdef'};
 const headers=await seoHeaders(request);const bodyHash=createHash('sha256').update('').digest('base64url');const expected=createHmac('sha256',request.secret).update(['GET',request.pathname,'123',request.nonce,bodyHash].join('\n')).digest('base64url');assert.equal(headers['x-wonly-signature'],expected);
});
test('unconfigured/unauthorized/redirected source fails closed, fixed host prevents credential leak',async()=>{
 assert.equal((await loadSeo()).status,'not_configured');let calls=0;assert.equal((await loadSeo({url:'https://other.com/seo-summary/v1/current',keyId:'test',secret:'test',fetcher:()=>{calls++;assert.fail()}})).status,'unavailable');assert.equal(calls,0);
 assert.equal((await loadSeo({url:'https://seo-api.wonlyglobal.com/seo-summary/v1/current',keyId:'test',secret:'test',fetcher:async(url,opts)=>{assert.equal(opts.redirect,'error');return new Response('{}',{status:401})}})).status,'unavailable');
});
test('source labels never claim a missing integration is live',()=>{assert.match(seoContextLabel({seo_status:'not_configured'}),/尚未配置/);assert.match(seoContextLabel({seo_status:'stale',seo_generated_at:sample.generated_at,seo_freshness:sample.freshness}),/过期/)});

test('sources not requested for this question do not show failure labels',()=>{assert.equal(seoContextLabel({seo_status:'not_requested'}),'');assert.equal(socialContextLabel({social_status:'not_requested'}),'');assert.match(seoContextLabel({seo_status:'unavailable'}),/暂不可用/);assert.match(socialContextLabel({social_status:'unavailable'}),/暂不可用/)});
