import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePublicOutreachEvidence,addPublicOutreachEvidence,generatePublicOutreach} from '../assets/outreach-public-compose-ui.mjs';
import {composeRequest} from '../assets/outreach-compose-policy.mjs';
function harness(){
 const nodes=new Map(),created=[];const node=()=>({children:[],dataset:{},style:{},checked:false,value:'',textContent:'',disabled:false,open:false,classList:{remove(){},add(){},contains(){return false}},scrollIntoView(){this.scrolled=true},focus(){this.focused=true},addEventListener(){},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]}});
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
 const h=harness();preparePublicOutreachEvidence(h.ctx);h.created.find(n=>n.dataset.publicEvidenceIndex==='0').checked=true;await generatePublicOutreach(h.ctx);assert.equal(h.calls.length,0);
 h.created.find(n=>n.dataset.publicEvidenceIndex==='0').checked=true;h.find('#outreach-public-confirm').checked=true;
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
 assert.equal(h.find('#outreach-body').scrolled,true);assert.equal(h.find('#outreach-body').focused,true);
});
test('incomplete research and missing recipient do not prevent editable model-generated copy',async()=>{
 const h=harness();h.ctx.research=()=>({generated:false,facts:[],signals:[]});h.ctx.recipient=()=>'';
 h.ctx.invoke=async(name,options)=>{h.calls.push({name,payload:options.body});return {data:{subject:'A needs discussion',subject_b:'Explore a potential fit',body:'Could we discuss the application and selection requirements?',pending_human_review:true}}};
 preparePublicOutreachEvidence(h.ctx);h.find('#outreach-public-confirm').checked=true;await generatePublicOutreach(h.ctx);
 assert.equal(h.calls[0].name,'outreach-compose');assert.equal(h.calls.length,1,'no save without recipient');
 assert.equal(h.find('#outreach-subject-b').value,'Explore a potential fit');assert.match(h.find('#outreach-body').value,/selection requirements/);
 assert.equal(h.find('#send-outreach').disabled,true);
});
test('empty evidence first click generates immediately without a redundant confirmation',async()=>{
 const h=harness();let confirmation='';h.ctx.confirm=async text=>{confirmation=text;return true};
 const invoke=h.ctx.invoke;h.ctx.invoke=async(name,options)=>{composeRequest(JSON.parse(JSON.stringify(options.body)));return invoke(name,options)};
 await generatePublicOutreach(h.ctx);
 assert.equal(confirmation,'');assert.equal(h.calls[0].name,'outreach-compose');assert.equal(h.calls[0].payload.confirmed_public,true);
 assert.equal(h.calls[0].payload.company_facts.length,0,'unselected candidates are not silently approved');
 assert.equal(h.calls[1].saved,true);
});
test('cancelled first-click scope confirmation performs no model call or save',async()=>{
 const h=harness();preparePublicOutreachEvidence(h.ctx);h.created.find(n=>n.dataset.publicEvidenceIndex==='0').checked=true;h.ctx.confirm=async()=>false;await generatePublicOutreach(h.ctx);assert.equal(h.calls.length,0);
});
