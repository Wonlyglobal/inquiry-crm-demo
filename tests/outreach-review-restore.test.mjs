import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('      function isInternalProductReviewDraft(');
const end=html.indexOf('      function renderOutreachHistory(',start);
function context(){
 const nodes=new Map();const $=selector=>{if(!nodes.has(selector)){const classes=new Set();nodes.set(selector,{value:'',textContent:'',disabled:false,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)}})}return nodes.get(selector)};
 const ctx={$,finalizedOutreachCopy:null,setTimeout:()=>{},restoreOutreachFinalCopy:()=>{},currentInquiry:{outreachDraftHistory:[]},resolveInquiryRecipient:()=>'',fmtDate:x=>x,renderOutreachHistory:()=>ctx.separateOutreachAnalysis(ctx.currentInquiry.latestOutreachDraft),evaluateOutreachDraft:()=>{}};vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);return ctx;
}
test('internal history moves exact analysis out of final preview without modifying stored body',()=>{
 const c=context();const body='【Grace 产品证据草稿｜仅内部审核，不可直接发送】\nfixture reference only';
 c.loadOutreachHistoryVersion({id:'internal',body,status:'draft',created_at:'2026-10-23',subject_a:'Review'});
 assert.equal(c.$('#outreach-body').value,'');assert.equal(c.$('#outreach-analysis-notes').textContent,body);assert.equal(c.currentInquiry.latestOutreachDraft.body,body);assert.equal(c.$('#outreach-draft').classList.contains('hidden'),true);assert.equal(c.$('#send-outreach').disabled,true);assert.equal(c.$('#send-outreach').classList.contains('hidden'),true);
 c.loadOutreachHistoryVersion({id:'normal',body:'Hello',status:'draft',subject_a:'Hello'});
 assert.equal(c.$('#send-outreach').disabled,false);assert.equal(c.$('#send-outreach').classList.contains('hidden'),false);
 assert.equal(c.$('#outreach-body').value,'Hello');assert.equal(c.$('#outreach-analysis-notes').textContent,'');assert.equal(c.$('#outreach-analysis-panel').classList.contains('hidden'),true);
 c.loadOutreachHistoryVersion({id:'sent',body:'Hello',status:'sent'});assert.equal(c.$('#send-outreach').disabled,true);
});
test('refresh routes internal review to history restore before customer-email validation and never re-enables send',()=>{
 const block=html.slice(html.indexOf('const latestDraft=(draftHistory'),html.indexOf('const quoteReviewButton=',html.indexOf('const latestDraft=(draftHistory')));
 assert.match(block,/if \(latestDraft && isInternalProductReviewDraft\(latestDraft\)\) \{\s+loadOutreachHistoryVersion\(latestDraft\);\s+\} else if \(latestDraft && !legacyDraftError\)/);
 assert.match(block,/latestDraft\?\.status !== "sent" && !isInternalProductReviewDraft\(latestDraft\)/);
});
