import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261029160000_candidate_research_filters.sql',import.meta.url),'utf8');
test('full-pool filters execute before counts and pagination, and mask all hidden-field filters',()=>{
 assert.match(sql,/private.sales_lead_actor/);assert.match(sql,/private.candidate_rate\('workspace_read',60\)/);
 for(const name of ['country_filter','category_filter','source_filter'])assert.ok(sql.indexOf(`coalesce(${name}`)<sql.indexOf('total:=total+1'));
 assert.match(sql,/if masked and \([\s\S]*country_filter[\s\S]*category_filter[\s\S]*source_filter[\s\S]*then continue/);
 assert.match(sql,/revoke all[\s\S]*from public,anon,service_role/);assert.match(sql,/to authenticated/);
 assert.doesNotMatch(sql,/update private|delete from|insert into public.inquiries/);
});
test('UI sends all filters to the server and resets paging on clear',async()=>{
 const page=await readFile(new URL('../assets/company-candidates-page.mjs',import.meta.url),'utf8');
 assert.match(page,/rpc\('filter_company_candidates'/);assert.match(page,/country_filter:/);assert.match(page,/category_filter:/);assert.match(page,/source_filter:/);
 assert.match(page,/clear-filters[\s\S]*offset=0;await load/);
});
