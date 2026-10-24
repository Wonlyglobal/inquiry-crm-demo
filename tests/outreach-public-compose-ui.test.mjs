import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePublicOutreachEvidence,addPublicOutreachEvidence,generatePublicOutreach} from '../assets/outreach-public-compose-ui.mjs';
function harness(){
 const nodes=new Map(),created=[];const node=()=>({children:[],dataset:{},style:{},checked:false,value:'',textContent:'',disabled:false,open:false,classList:{remove(){},add(){}},addEventListener(){},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]}});
 const find=key=>{if(!nodes.has(key))nodes.set(key,node());return nodes.get(key)};
 globalThis.document={createElement(){const n=node();created.push(n);return n},querySelectorAll(){return created.filter(n=>n.dataset.publicEvidenceIndex!==undefined&&n.checked)}};
 find('#outreach-objective').value='meeting';find('#outreach-tone').value='consultative';
 const inquiry={id:'11111111-1111-4111-8111-111111111111'},calls=[];
 const ctx={getInquiry:()=>inquiry,find,toast:()=>{},research:()=>({generated:true,facts:[{statement:'Synthetic public company fact',sourceUrl:'https://example.com/about',date:'2026-10-24'},{statement:'private@example.com',sourceUrl:'https://example.com/contact',date:'2026-10-24'}],signals:[]}),lines:()=>[],parse:x=>x,recipient:()=>'private-recipient@example.com',contactName:()=>'Private Person',signature:()=>'Private Signer',setMode:()=>{},quality:()=>{},edgeError:async()=>'',invoke:async(name,options)=>{calls.push({name,payload:options.body});return {data:{subject:'Synthetic meeting',body:'Synthetic sourced discussion. Could we arrange a meeting?',pending_human_review:true}}},save:async()=>{calls.push({saved:true});return {id:'draft'}}};
 return {ctx,find,created,calls};
}
test('public candidate preparation never calls provider and starts unselected',()=>{
 const h=harness();preparePublicOutreachEvidence(h.ctx);assert.equal(h.calls.length,0);
 assert.equal(h.created.filter(n=>n.dataset.publicEvidenceIndex!==undefined).length,1);
 assert.equal(h.find('#outreach-public-confirm').checked,false);
});
test('generation refuses unconfirmed input and never projects local recipient or signature',async()=>{
 const h=harness();preparePublicOutreachEvidence(h.ctx);await generatePublicOutreach(h.ctx);assert.equal(h.calls.length,0);
 h.created.find(n=>n.dataset.publicEvidenceIndex==='0').checked=true;h.find('#outreach-public-confirm').checked=true;
 await generatePublicOutreach(h.ctx);
 assert.equal(h.calls.length,0,'company-only input must not generate a generic letter');
 for(const kind of ['market_facts','product_facts']){
  h.find('#outreach-public-kind').value=kind;h.find('#outreach-public-statement').value='Synthetic reviewed '+kind;h.find('#outreach-public-source').value='https://example.com/'+kind;h.find('#outreach-public-date').value='2026-10-24';addPublicOutreachEvidence(h.ctx);
 }
 // render replaces DOM candidates; select only current visible nodes, as a real DOM does.
 const current=h.find('#outreach-public-evidence-list').children.flatMap(label=>label.children).filter(n=>n.dataset.publicEvidenceIndex!==undefined);
 h.created.forEach(n=>n.checked=false);current.forEach(n=>n.checked=true);h.find('#outreach-public-confirm').checked=true;
 await generatePublicOutreach(h.ctx);
 assert.equal(h.calls[0].name,'outreach-compose');assert.equal(h.calls[0].payload.company_facts.length,1);
 assert.equal(JSON.stringify(h.calls[0].payload).includes('private-recipient'),false);assert.equal(JSON.stringify(h.calls[0].payload).includes('Private Person'),false);assert.equal(JSON.stringify(h.calls[0].payload).includes('Private Signer'),false);
 assert.match(h.find('#outreach-body').value,/Dear Private,/);assert.match(h.find('#outreach-body').value,/Private Signer/);assert.equal(h.calls[1].saved,true);
});
