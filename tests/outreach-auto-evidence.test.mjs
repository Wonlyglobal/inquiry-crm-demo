import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOutreachEvidence} from '../assets/outreach-auto-evidence.mjs';
import {publicMarketCode,publicMarketQuery} from '../assets/outreach-research-plan.mjs';
const plan={inquiryId:'12345678-1234-1234-1234-123456789abc',company:'Example',domain:'example.com',country:'Belarus',categories:['steel_door']};
test('market search uses fixed country and product terms only',()=>{
 assert.equal(publicMarketQuery(publicMarketCode('Belarus + private@example.com'),'steel_door'),'Belarus steel doors');
 assert.equal(publicMarketQuery('private@example.com','steel_door'),'');
 assert.equal(publicMarketQuery('BY','arbitrary query'),'');
 assert.equal(publicMarketCode('Indonesia'),'ID');
});
test('retrieval separates internal catalogue from public summaries and rejects private snippets',async()=>{
 const calls=[],progress=[];
 const result=await collectOutreachEvidence({...plan,progress:x=>progress.push(x),invoke:async(name,{body})=>{
 calls.push({name,body});
 if(name==='agent-conversation')return {data:{evidence:[{quote:'INTERNAL CATALOGUE SECRET'}]}};
 return {data:body.company_name==='WONLY'?{website_evidence:[{title:'Steel doors',description:'Steel doors for entrance applications.',url:'https://www.wonlyglobal.com/products/steel'}]}:{website_evidence:[{description:'A door distribution business.',url:'https://example.com/about'},{description:'Contact private@example.com',url:'https://example.com/contact'}],market_headlines:[{title:'Belarus construction report',source_url:'https://example.org/news',date:'2026-10-28'}]}};
 }});
 assert.deepEqual(result.counts,{company_facts:1,market_facts:1,product_facts:1});
 assert.equal(JSON.stringify(result.items).includes('SECRET'),false);
 assert.equal(JSON.stringify(result.items).includes('private@'),false);
 assert.deepEqual(calls.find(c=>c.name==='agent-conversation').body,{action:'outreach-product-evidence',inquiry_id:plan.inquiryId,categories:['steel_door'],model:''});
 assert.equal(calls.some(c=>c.name==='outreach-compose'),false);
 assert.equal(progress.length,3);assert.match(result.items[1].statement,/HEADLINE ONLY/);
});
test('partial failure retains public evidence and records gaps without invoking generation',async()=>{
 const result=await collectOutreachEvidence({...plan,invoke:async(name,{body})=>{
 if(name==='agent-conversation')throw Error('catalogue unavailable');
 if(body.company_name==='WONLY')throw Error('website unavailable');
 return {data:{website_evidence:[{description:'Door distribution.',url:'https://example.com/about'}]}};
 }});
 assert.equal(result.counts.company_facts,1);assert.equal(result.counts.product_facts,0);
 assert.ok(result.gaps.some(x=>x.includes('catalogue unavailable')));
});
test('changed inquiry aborts before starting further retrieval',async()=>{
 let current=true,calls=0;
 await assert.rejects(collectOutreachEvidence({...plan,isCurrent:()=>current,invoke:async()=>{calls++;current=false;return {data:{}}}}),/切换/);
 assert.equal(calls,1);
});
test('mail provider and absent category never cause guessed company or product retrieval',async()=>{
 let calls=0;
 const result=await collectOutreachEvidence({...plan,domain:'gmail.com',categories:[],invoke:async()=>{calls++;return {data:{}}}});
 assert.equal(calls,0);assert.equal(result.items.length,0);assert.ok(result.gaps.length>=2);
});
