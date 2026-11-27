import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {detectMailSignals,splitMailText,paintMailSignals,signalCustomerEmails,MAIL_SIGNAL_VERSION} from '../assets/mail-pipeline-signals.mjs';
const now=Date.parse('2026-11-27T10:00:00Z');
const inquiry={id:'inquiry',owner_id:'sales',status:'quoted',validity:'valid',invalid_review_status:null,assigned_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-20T00:00:00Z'};
const context={inquiry,available:true,role:'sales',actorId:'sales',ownEmails:['sales@wonlyglobal.com'],customerEmails:['buyer@example.invalid']};
const incoming=(body_text,extra={})=>({id:'mail',inquiry_id:'inquiry',association_status:'matched',direction:'inbound',sender_email:'buyer@example.invalid',recipient_emails:['sales@wonlyglobal.com'],subject:'Project A',received_at:'2026-11-26T08:00:00Z',body_text,...extra});
const outgoing=(body_text,extra={})=>({...incoming(body_text),direction:'outbound',received_at:null,sent_at:'2026-11-26T09:00:00Z',sender_email:'sales@wonlyglobal.com',recipient_emails:['buyer@example.invalid'],...extra});
const detect=(m,c=context)=>detectMailSignals(Array.isArray(m)?m:[m],c,now);
test('requests for quotes are distinct from actually sent quote evidence in supported languages',()=>{
 for(const text of ['Please quote 20 doors. Budget USD 5000.','Please provide us with a quotation.','请给我们报价。','Solicito una cotización para una puerta.','Solicito uma cotação.','Demande de devis pour les portes.']){
  const s=detect(incoming(text));assert.equal(s[0]?.kind,'quote_request',text);assert.equal(s.some(x=>x.kind==='quote_sent'),false);
 }
 assert.deepEqual(detect(incoming('We no longer need a quotation. Please quote was the old request.')),[]);
});
test('our quote needs real outbound identity, successful send time, customer recipient and concrete content',()=>{
 const c={...context,inquiry:{...inquiry,status:'contacted'}};
 for(const offer of ['Our price is USD 1200.','Unit price: USD 1200.','单价：USD 1200。'])assert.equal(detect(outgoing(offer),c)[0]?.kind,'quote_sent',offer);
 const evidence=detect(outgoing('Our quotation is USD 1200 for 20 doors.'),c);assert.equal(evidence[0]?.kind,'quote_sent');assert.equal(evidence[0]?.route,'quote');
 assert.equal(detect(outgoing('Please find attached our quotation.' ,{attachment_count:1}),c)[0]?.kind,'quote_sent');
 assert.deepEqual(detect(outgoing('Please find attached our quotation.'),c),[]);
 for(const patch of [{sender_email:'former@wonlyglobal.com'},{recipient_emails:['colleague@wonlyglobal.com']},{recipient_emails:['unrelated@example.invalid']},{sent_at:null},{folder:'Drafts'},{folder:'Outbox'},{subject:'Fwd: quotation'},{association_status:'pending'},{inquiry_id:'other'}])assert.deepEqual(detect(outgoing('Our quotation is USD 1200.',patch),c),[],JSON.stringify(patch));
});
test('future promises, negative statements and copied earlier quotations do not establish a quote',()=>{
 for(const text of ['We will send our quotation USD 1200 tomorrow.','We have not sent our quotation USD 1200.','我们尚未发送报价。报价如下 USD 1200。','Our quotation will follow. USD 1200 is your budget.','Thanks, we will check.\nOn Mon, Buyer wrote:\nOur quotation is USD 1200.','Thanks.\nFrom: Sales\nSent: Monday\nOur quotation is USD 1200.','收到，我们再核对。\n----- 原始邮件 -----\n报价如下 USD 1200。','Thanks.\nEl lunes, Buyer escribió:\nOur quotation is USD 1200.'])assert.deepEqual(detect(outgoing(text)),[],text);
 assert.equal(splitMailText('new text\n> old quote').text,'new text');
});
test('historical, pre-assignment, incomplete and future messages never offer a stage action',()=>{
 const c={...context,inquiry:{...inquiry,status:'contacted'}};
 for(const patch of [{historical:true},{body_truncated:true},{body_status:'unavailable'},{sent_at:'2026-10-01T00:00:00Z'}]){const s=detect(outgoing('Our quotation is USD 1500.',patch),c);assert.equal(s[0]?.route,null,JSON.stringify(patch));}
 assert.deepEqual(detect(outgoing('Our quotation is USD 1500.',{sent_at:'2027-01-01T00:00:00Z'}),c),[]);
});
test('price negotiation can prepare negotiation only after a quote or sample, never regress or close a deal',()=>{
 for(const status of ['quoted','sample_sent'])assert.equal(detect(incoming('Could you offer a discount?'),{...context,inquiry:{...inquiry,status}})[0]?.route,'negotiation');
 for(const status of ['received','contacted','negotiating','won','lost'])assert.equal(detect(incoming('Could you offer a discount?'),{...context,inquiry:{...inquiry,status}})[0]?.route,null);
 for(const change of [{role:'sales_manager'},{role:'marketing'},{readOnly:true},{actorId:'other'},{available:false},{inquiry:{...inquiry,validity:'pending'}},{inquiry:{...inquiry,invalid_review_status:'pending'}}])assert.equal(detect(incoming('Please give us a discount.'),{...context,...change})[0]?.route,null);
 assert.equal(detect(incoming('Please give us a discount.',{sender_email:'colleague@wonlyglobal.com'})).length,0);
 assert.equal(detect(incoming('Please give us a discount.',{sender_email:'supplier@example.invalid'}))[0]?.route,null);
});
test('sample requests, shipping evidence and customer order intent remain separate from verified milestones',()=>{
 assert.equal(detect(incoming('Please send samples.'))[0]?.kind,'sample_request');
 const sent=detect(outgoing('We have shipped samples. Tracking number: DHL123456789.'));assert.equal(sent[0]?.kind,'sample_sent');assert.equal(sent[0]?.route,'sample');
 assert.deepEqual(detect(outgoing('We will send samples. Tracking number DHL123456789.')),[]);
 assert.deepEqual(detect(outgoing('We have shipped samples. Tracking number: available soon.')),[]);
 const accepted=detect(incoming('We accept your quotation.'));assert.equal(accepted[0]?.kind,'order_intent');assert.equal(accepted[0]?.route,'order');assert.equal('targetStage' in accepted[0],false);
 assert.deepEqual(detect(incoming('We cannot accept your quotation.')),[]);
});
test('evidence excerpt is near the actual signal, not just the start of a long message',()=>{
 const s=detect(outgoing('General context. '.repeat(200)+'Our quotation is EUR 900 for the doors.'));assert.match(s[0].evidence,/Our quotation is EUR 900/);assert.equal(s[0].version,MAIL_SIGNAL_VERSION);
});
class Node{constructor(tag){this.tag=tag;this.children=[];this.textContent='';}append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this.children=nodes}}
const text=n=>[n.textContent,...n.children.map(text)].join('\n');const nodes=n=>[n,...n.children.flatMap(nodes)];
test('safe local panel opens evidence and only prepares an explicitly clicked review; partial reads hide review actions',()=>{
 const old=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};
 try{let reviewed=0,opened='';const host=new Node('section'),s=detect(incoming('Please quote the doors. <script>untrusted()</script>'));
 paintMailSignals(host,s,{loadedCount:1,onReview:()=>reviewed++,onOpenMessage:id=>opened=id});assert.equal(reviewed,0);assert.equal(opened,'');
 assert.match(text(host),/客户要求报价/);assert.match(text(host),/<script>/);assert.ok(nodes(host).every(n=>!['script','img'].includes(n.tag)));
 nodes(host).find(n=>n.textContent==='查看对应邮件原文').onclick();assert.equal(opened,'mail');assert.equal(reviewed,0);
 nodes(host).find(n=>n.textContent==='核对报价流程').onclick();assert.equal(reviewed,1);
 paintMailSignals(host,s,{partial:true,loadedCount:1});assert.ok(!nodes(host).some(n=>n.textContent==='核对报价流程'));assert.match(text(host),/本轮仅供核对/);
 }finally{globalThis.document=old}
});
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function workflowHarness({role='sales',readOnly=false,confirm=true,freshPatch={},unsaved='',saveData={id:'inquiry'}}={}){
 const fields=new Map(),effects=[],predicates=[];
 const values={'detail-status':'quoted','detail-reason':unsaved,'detail-owner':'sales','detail-estimated-amount':'1200','detail-estimated-currency':'USD','detail-probability':'','detail-expected-close':'','detail-deal-type':'first_order','detail-primary-source':'email','detail-risk-flag':'','detail-outcome-reason-type':'','detail-invalid-reason':''};
 for(const [id,value] of Object.entries(values))fields.set('#'+id,{value,disabled:false,checked:false,focus(){effects.push('focus')},scrollIntoView(){effects.push('scroll')}});
 const q={select(){return this},eq(k,v){predicates.push([k,v]);return this},single:async()=>({data:{...inquiry,...freshPatch}}),maybeSingle:async()=>({data:saveData,error:null}),then(resolve){return Promise.resolve({data:saveData,error:null}).then(resolve)}};
 const box={currentInquiry:{...inquiry},profile:{id:'sales',role},crmReadOnly:readOnly,pendingMailStageReview:null,
  supabase:{from(table){assert.equal(table,'inquiries');return{...q,update(update){effects.push(['update',update]);return this}}},functions:{invoke(){throw Error('Must not notify or send')}},rpc(){throw Error('Must not invoke a write RPC')}},
  $:selector=>{if(!fields.has(selector))fields.set(selector,{value:'',disabled:false,focus(){},scrollIntoView(){effects.push('scroll')}});return fields.get(selector)},
  toast:msg=>effects.push(['toast',msg]),setDetailTab:tab=>effects.push(['tab',tab]),syncDetailedOutcomeVisibility(){},
  appConfirm:async()=>confirm,openQuoteManager:()=>effects.push('quote'),openFulfillmentManager:()=>effects.push('sample'),normalizeDealType:v=>v,
  loadTimeline:async()=>effects.push('timeline'),loadInquiries:async()=>effects.push('reload'),loadNotifications:async()=>{},Date,Number,Promise};
 vm.createContext(box);
 const start=html.indexOf('      async function reviewMailPipelineSignal('),end=html.indexOf('      $("#detail-open-mail-conversation").addEventListener',start);
 vm.runInContext(html.slice(start,end),box);
 const saveStart=html.indexOf('      $("#save-detail").addEventListener("click", async () => {')+'      $("#save-detail").addEventListener("click", async () => {'.length;
 const saveEnd=html.indexOf('      $("#complete-research").addEventListener',saveStart);
 const body=html.slice(saveStart,saveEnd).replace(/\s*\}\);\s*$/,'');vm.runInContext('async function testSave(){'+body+'}',box);
 return{box,fields,effects,predicates,review:route=>box.reviewMailPipelineSignal({inquiryId:'inquiry',messageId:'mail-id',version:MAIL_SIGNAL_VERSION,route,historical:false},{inquiry}),save:()=>box.testSave()};
}
test('actual review handler routes quote/sample/order to existing checks and never saves or sends',async()=>{
 for(const [route,effect] of [['quote','quote'],['sample','sample'],['order',null]]){const h=workflowHarness();await h.review(route);if(effect)assert.ok(h.effects.includes(effect));assert.equal(h.box.currentInquiry.status,'quoted');assert.ok(!h.effects.some(e=>Array.isArray(e)&&e[0]==='update'));assert.equal(h.box.pendingMailStageReview,null);}
});
test('actual review handler preserves drafts, cancellation and changed owner; negotiation requires explicit preparation',async()=>{
 for(const opts of [{role:'sales_manager'},{readOnly:true},{confirm:false},{freshPatch:{owner_id:'other'}},{unsaved:'已有草稿'}]){const h=workflowHarness(opts);await h.review('negotiation');assert.equal(h.fields.get('#detail-status').value,'quoted');assert.equal(h.box.pendingMailStageReview,null);}
 const h=workflowHarness();await h.review('negotiation');assert.equal(h.fields.get('#detail-status').value,'negotiating');assert.equal(h.box.currentInquiry.status,'quoted');assert.match(h.fields.get('#detail-reason').value,/mail-id/);assert.ok(!h.effects.some(e=>Array.isArray(e)&&e[0]==='update'));
});
test('actual save uses old owner, stage and version predicates; concurrent changes do not move stage',async()=>{
 for(const accepted of [true,false]){const h=workflowHarness({saveData:accepted?{id:'inquiry'}:null});await h.review('negotiation');await h.save();
  assert.ok(h.predicates.some(([k,v])=>k==='owner_id'&&v==='sales'));assert.ok(h.predicates.some(([k,v])=>k==='status'&&v==='quoted'));assert.ok(h.predicates.some(([k,v])=>k==='updated_at'&&v===inquiry.updated_at));
  assert.equal(h.box.currentInquiry.status,accepted?'negotiating':'quoted');if(accepted){assert.equal(h.box.pendingMailStageReview,null);assert.ok(h.effects.includes('timeline'));}else assert.ok(h.effects.some(e=>Array.isArray(e)&&/请刷新/.test(e[1])));
 }
});
test('both production entry points retain approval gates, local-only rules and compare-and-set save',()=>{
 for(const file of ['index.html','grace.html']){const s=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.match(s,/onReviewSignal:reviewMailPipelineSignal/);assert.match(s,/报价管理.*主管审批并发送客户/);assert.match(s,/履约跟踪.*快递单号和寄出时间/);assert.match(s,/eq\("updated_at",mailReview.updated_at\)/);}
 const module=fs.readFileSync(new URL('../assets/mail-pipeline-signals.mjs',import.meta.url),'utf8');assert.doesNotMatch(module,/\bfetch\s*\(|functions\.invoke|localStorage|sessionStorage|innerHTML|sendMail/);
});

test('registered customer address ignores relay senders, quoted signatures and ambiguous contacts',()=>{
 assert.deepEqual(signalCustomerEmails({email_intake:{sender_email:'buyer@example.invalid'},original_message:'Email: unrelated@example.invalid'}),['buyer@example.invalid']);
 assert.deepEqual(signalCustomerEmails({email_intake:{sender_email:'notify@web3forms.com'},original_message:'Email: buyer@example.invalid\nMessage: Please quote.'}),['buyer@example.invalid']);
 assert.deepEqual(signalCustomerEmails({original_message:'Email: first@example.invalid\nEmail: second@example.invalid'}),[]);
 assert.deepEqual(signalCustomerEmails({original_message:'Thank you\nOn Monday, Buyer wrote:\nEmail: old@example.invalid'}),[]);
 assert.deepEqual(signalCustomerEmails({email_intake:{parsed_data:{email:'sales@wonlyglobal.com'}}}),[]);
});
test('edited adoption reason still retains rule version and source message in existing audit field',async()=>{
 const h=workflowHarness();await h.review('negotiation');h.fields.get('#detail-reason').value='客户讨论折扣，人工核对后推进';await h.save();const update=h.effects.find(e=>Array.isArray(e)&&e[0]==='update')[1];assert.match(update.last_change_reason,/mail-id/);assert.match(update.last_change_reason,/mail-pipeline-20261127-v1/);
});
test('repeated signals show the newest evidence per category while original messages remain intact',()=>{
 const old=incoming('Please quote.',{id:'old',received_at:'2026-11-24T08:00:00Z'}),latest=incoming('Please quote again.',{id:'new'});const messages=[old,latest];assert.equal(detect(messages).length,1);assert.equal(detect(messages)[0].messageId,'new');assert.equal(messages.length,2);
 assert.deepEqual(signalCustomerEmails({email_intake:{parsed_data:{email:['first@example.invalid','second@example.invalid']}}}),[]);
});
