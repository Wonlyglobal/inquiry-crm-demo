import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidateMetrics,candidateTable,candidateDetail} from '../assets/company-candidates-ui.mjs';
const item={id:'synthetic',company:'示例 <门业>',country:'Ghana',state:'pending',source_kind:'company_site_candidate',snapshot_date:'2026-10-01',website:'https://example.com/',source_url:'https://example.com/about',can_review:true};
test('table and drawer escape untrusted values and links',()=>{
 const table=candidateTable([item]);assert.match(table,/&lt;门业&gt;/);assert.doesNotMatch(table,/<门业>/);assert.match(table,/data-detail="synthetic"/);
 const detail=candidateDetail({...item,website:'javascript:alert(1)',source_url:'javascript:alert(2)'},String);
 assert.doesNotMatch(detail,/href="javascript:/);assert.match(detail,/核对官网与公司身份/);
});
test('masked records expose only responsible name and state without details or actions',()=>{
 const masked={...item,masked:true,can_claim:true,mine:true,responsible_name:'示例负责人'};
 const table=candidateTable([masked]);assert.match(table,/示例负责人/);assert.doesNotMatch(table,/Ghana|example\.com|synthetic|data-detail|data-claim|data-review/);
 assert.equal(candidateDetail(masked,String),'');
});
test('drawer actions continue to follow server permission flags',()=>{
 assert.doesNotMatch(candidateDetail({...item,can_review:false},String),/data-review/);
 assert.match(candidateDetail({...item,can_claim:true},String),/data-claim/);
 assert.doesNotMatch(candidateDetail({...item,mine:true,lead_id:'linked'},String),/data-promote/);
 assert.match(candidateDetail({...item,mine:true},String),/data-promote/);
});
test('totals come from current server view and page count is explicitly separate',()=>{
 const metrics=candidateMetrics({total:1766,pending:1763,verified:0,items:[item]});
 assert.match(metrics,/1766/);assert.match(metrics,/1763/);assert.match(metrics,/本页展示/);
 assert.match(candidateTable([]),/colspan="7"/);
});
test('layout keeps original controls, forms and data contracts exactly once',()=>{
 const html=readFileSync(new URL('../company-candidates.html',import.meta.url),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const id of ['search','filter','refresh','counts','candidate-list','review-form','claim-panel','promote-form','import','template','previous','next','candidate-dialog'])assert.ok(ids.includes(id),id);
 assert.match(html,/<tbody id="candidate-list">/);assert.match(html,/<dialog id="candidate-dialog"/);
 const page=readFileSync(new URL('../assets/company-candidates-page.mjs',import.meta.url),'utf8');
 for(const name of ['company_candidate_workspace','review_company_candidate','claim_company_candidate','promote_company_candidate','import_company_candidates'])assert.match(page,new RegExp(name));
 assert.match(page,/if\(!item\|\|item.masked\)return/);assert.match(page,/closeCandidate\(\);\n view=await rpc/);
 assert.doesNotMatch(page,/localStorage|sessionStorage|record_sales_leads/);
});
