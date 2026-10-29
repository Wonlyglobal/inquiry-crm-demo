import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {publicCandidateUrl,candidateImportRows,candidateBatches,candidateReceipt} from '../assets/company-candidates.mjs';
const row={lead_id:'synthetic-only',company_candidate:'Synthetic Doors',country_candidate:'Ghana',website_candidate:'https://example.com/',source_url:'https://example.com/about',source_kind:'company_site_candidate',source_snapshot_date:'2026-07-28'};
test('company candidates never inherit verified status from imported files',()=>{const value=candidateImportRows([{...row,review_status:'verified',current_status:'已核实'}])[0];assert.equal(value.current_status,'待核实');assert.equal(value.review_status,'needs_official_source_review')});
test('contact columns are rejected rather than silently stripped',()=>{assert.throws(()=>candidateImportRows([{...row,email:'name@example.com'}]),/非公司级字段/);assert.throws(()=>candidateImportRows([{...row,company_candidate:'sales@example.com'}]),/公司字段混有邮箱/)});
test('public sources support international domain names without admitting maps or email platforms',()=>{
 assert.equal(publicCandidateUrl('https://xn--80anfggddm2b8e.xn--p1ai/'),true);
 for(const url of ['http://example.com','javascript:alert(1)','https://gmail.com/','https://google.com/maps/synthetic','https://example.com/?email=private','https://user:pass@example.com/'])assert.equal(publicCandidateUrl(url),false,url);
});
test('1766 candidates become nine bounded batches with independent stable replay IDs',()=>{
 const rows=candidateImportRows(Array.from({length:1766},(_,i)=>({...row,lead_id:'synthetic-'+i,company_candidate:'Synthetic '+i})));const parts=candidateBatches(rows);assert.equal(parts.length,9);assert.equal(parts.at(-1).rows.length,166);assert.equal(new Set(parts.map(p=>p.id)).size,9);assert.equal(parts.reduce((n,p)=>n+p.rows.length,0),1766);assert.throws(()=>candidateImportRows(Array(2001).fill(row)));
});
test('imports require a matching receipt before marking a batch complete',()=>{
 const id=crypto.randomUUID();assert.throws(()=>candidateReceipt({batch_id:id,processed:200,added:199,deduplicated:0,recorded_at:'now'},id,200));assert.throws(()=>candidateReceipt(null,id,200));assert.equal(candidateReceipt({batch_id:id,processed:200,added:190,deduplicated:10,recorded_at:'now'},id,200).added,190);
});
test('both navigation surfaces expose the separate pool without using the existing inquiry pool',()=>{
 for(const file of ['index.html','grace.html']){const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.match(html,/data-view="company-candidates" href="#view=company-candidates"/);assert.match(html,/leadWorkspaceRoute\(view,profile\?\.role\)/)}
 const page=readFileSync(new URL('../assets/company-candidates-page.mjs',import.meta.url),'utf8');assert.doesNotMatch(page,/localStorage|sessionStorage|record_sales_leads/);assert.match(page,/promote_company_candidate/);assert.match(page,/candidateReceipt/);
});
