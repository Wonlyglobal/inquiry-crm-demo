import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
import{revealOutreachPreview}from'../assets/outreach-preview.mjs';
test('new copy is revealed and focused without a second focus scroll',()=>{
 const calls=[],nodes={'#outreach-draft':{classList:{contains:()=>false},closest:()=>({classList:{contains:()=>false}})},'#outreach-body':{scrollIntoView:x=>calls.push(['scroll',x]),focus:x=>calls.push(['focus',x])}};
 assert.equal(revealOutreachPreview(x=>nodes[x]),true);assert.equal(calls[0][0],'scroll');assert.deepEqual(calls[1],['focus',{preventScroll:true}]);
});
test('hidden result or inactive inquiry tab never steals focus',()=>{
 const draft={classList:{contains:()=>true}};assert.equal(revealOutreachPreview(x=>x==='#outreach-draft'?draft:{}),false);
 draft.classList.contains=()=>false;draft.closest=()=>({classList:{contains:()=>true}});assert.equal(revealOutreachPreview(x=>x==='#outreach-draft'?draft:{}),false);
});
test('earliest layout keeps the original action in the header with request protection',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../assets/outreach-floating-action.css',import.meta.url),'utf8');
 assert.equal((html.match(/id="generate-outreach"/g)||[]).length,1);assert.doesNotMatch(html,/<link[^>]+outreach-floating-action/);assert.match(html,/dataset\.requestActive==='true'/);
 assert.match(css,/#detail-modal:has\(\[data-detail-section="outreach"\]:not\(\.hidden\)\) \.modal/);assert.match(css,/backdrop-filter: none/);
 assert.doesNotMatch(html,/generate-outreach"\)\.disabled = !generated/);
});
