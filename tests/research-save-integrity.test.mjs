import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {researchAddressPatch} from '../assets/research-address-patch.mjs';
import {publicResearchSaveError} from '../assets/business-public-research.mjs';
import {normalizeSubmission} from '../supabase/functions/business-company-intake/payload.mjs';
const previous={map_address:'Existing address',google_maps_url:'https://maps.google.com/',openstreetmap_url:null,map_provider:'existing',map_place_id:'123',map_verified_at:'2026-09-01T00:00:00Z'};
test('unrelated research saves omit all unchanged address fields and verification metadata',()=>{
 assert.deepEqual(researchAddressPatch(previous,{map_address:' Existing address ',google_maps_url:previous.google_maps_url}),{});
 assert.deepEqual(researchAddressPatch(null,{map_address:'',google_maps_url:null}),{});
 assert.equal({...previous,...researchAddressPatch(previous,previous)}.map_verified_at,previous.map_verified_at);
});
test('edited address or map link invalidates verification, never stamps now',()=>{
 for(const values of [{...previous,map_address:'Changed address'},{...previous,google_maps_url:'https://maps.google.com/new'}])assert.equal(researchAddressPatch(previous,values).map_verified_at,null);
 assert.deepEqual(researchAddressPatch(previous,{}),{map_address:null,google_maps_url:null,openstreetmap_url:null,map_provider:null,map_place_id:null,map_verified_at:null});
 assert.equal(researchAddressPatch(null,{map_address:'New candidate',map_provider:'geoapify'}).map_verified_at,null);
});
test('SDK HTTP errors are decoded to safe, actionable persistent messages',async()=>{
 const result={error:{context:new Response(JSON.stringify({error:'private_content_not_allowed',secret:'NEVER ECHO'}),{status:400})}};
 const message=await publicResearchSaveError(result);assert.match(message,/private_content_not_allowed/);assert.match(message,/报价/);assert.doesNotMatch(message,/NEVER ECHO/);
 assert.match(await publicResearchSaveError({data:{error:'readback_unconfirmed'}}),/不要重复提交/);
 assert.doesNotMatch(await publicResearchSaveError({data:{error:'sensitive arbitrary server text'}}),/sensitive arbitrary/);
 assert.match(await publicResearchSaveError({error:{context:{clone(){throw Error('bad response')}}}}),/未确认/);
});
test('public catalogue text containing restricted wording fails closed; product-only facts pass',()=>{
 const submission={domain:'example.com',company:'Example',country:'AE',identity_confirmed:true,publication_reviewed:true,expected_version:0,request_id:'12345678-1234-4123-8123-123456789012',facts:[{field:'products',value:'外门目录展示多种门类系列，可申请项目报价。',source_url:'https://example.com/',accessed_at:'2026-10-22',verification:'official_self_report'}]};
 assert.throws(()=>normalizeSubmission(submission),/private_content_not_allowed/);
 submission.facts[0].value='外门目录展示多种门类系列；不代表库存或品牌授权已经独立核验。';assert.equal(normalizeSubmission(submission).payload.facts.length,1);
});
test('live save handler uses patch semantics and preserves intake failure in status text',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/\.\.\.researchAddressPatch\(before,/);assert.doesNotMatch(html,/map_verified_at:.*new Date/);
 assert.match(html,/publicResearchSaveError\(result\)/);assert.match(html,/detail-research-status[\s\S]*?textContent=message/);
});
