import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {summarizeInquiryMail as summarize,loadInquiryMailReplies,mailReplyText} from '../assets/inquiry-mail-replies.mjs';
const inquiry={id:'i',owner_id:'s',assigned_at:'2026-11-01T00:00:00Z'};
const box={id:'b',user_id:'s',email:'sales@wonlyglobal.com',mailbox_kind:'personal',status:'connected',last_synced_at:'2026-11-27T00:00:00Z'};
const incoming={id:'a',inquiry_id:'i',association_status:'matched',direction:'inbound',sender_email:'buyer@customer.invalid',message_id:'<incoming>',received_at:'2026-11-26T01:00:00Z'};
const reply={id:'r',inquiry_id:'i',association_status:'matched',direction:'outbound',sender_email:box.email,recipient_emails:[incoming.sender_email],in_reply_to:'<incoming>',reference_ids:[],subject:'Re: Doors',message_id:'<reply>',sent_at:'2026-11-26T02:00:00Z'};
const state=(messages,extra={})=>summarize(inquiry,{messages,connections:[box],asOf:'2026-11-27T03:00:00Z',...extra});
test('real current-owner reply and later customer response produce evidence-based states',()=>{
 let s=state([incoming,reply]);assert.equal(s.code,'replied');assert.equal(s.lastReply,reply.sent_at);
 s=state([incoming,reply,{...incoming,id:'later',message_id:'<later>',in_reply_to:'<reply>',received_at:'2026-11-26T03:00:00Z'}]);assert.equal(s.code,'incoming');assert.match(s.label,/再次来信/);
 assert.equal(state([incoming]).code,'incoming');assert.match(state([]).label,/不能判断/);
});
test('forwarding, another owner, pre-assignment mail, queued/missing timestamps and unrelated sends are not replies',()=>{
 for(const change of [{subject:'Fwd: Doors'},{recipient_emails:['internal@wonlyglobal.com']},{sender_email:'other@wonlyglobal.com'},{sent_at:'2026-10-01T02:00:00Z'},{sent_at:null},{sent_at:'2030-01-01T00:00:00Z'},{in_reply_to:'<another>',reference_ids:[]},{association_status:'ignored'},{folder:'Outbox'},{folder:'草稿箱'}])assert.equal(state([incoming,{...reply,...change}]).lastReply,null,JSON.stringify(change));
 assert.equal(state([incoming,{...reply,in_reply_to:null,reference_ids:['<incoming>']}]).code,'replied');
 assert.equal(state([incoming,{...reply,in_reply_to:null,reference_ids:[]}]).code,'sent_unverified');
});
test('duplicate message copies do not change last response, and internal forwards are not customer replies',()=>{
 const s=state([incoming,incoming,reply,reply,{...incoming,sender_email:'forward@wonlyglobal.com',received_at:'2026-11-27T01:00:00Z'}]);assert.equal(s.code,'replied');assert.equal(s.lastIncoming,incoming.received_at);
 assert.equal(state([{...incoming,association_status:'pending'}]).code,'no_evidence');
});
test('unavailable sync and partial pages remain explicitly uncertain without changing CRM stages',()=>{
 assert.equal(state([incoming,reply],{partial:true}).code,'partial');assert.equal(state([],{error:true}).code,'unavailable');
 const s=state([incoming,reply],{connections:[{...box,status:'error',error_message:'private server error'}]});assert.match(s.syncNote,/同步异常/);assert.doesNotMatch(mailReplyText(s),/private server error/);
 assert.equal(summarize({...inquiry,owner_id:null}).code,'unassigned');assert.equal(inquiry.assigned_at,'2026-11-01T00:00:00Z');
});
function mockClient({fail=false,full=false}={}){
 const calls=[];return {calls,rpc(name,args){calls.push({table:'history',fields:'metadata',name,args});return Promise.resolve({data:{items:[],has_more:false}})},from(table){const call={table};calls.push(call);const query={select(fields){call.fields=fields;return this},eq(){return this},in(field,ids){call[field]=ids;return this},order(){return this},range(from,to){call.range=[from,to];return this},then(resolve,reject){return Promise.resolve(table==='inquiries'?{data:[inquiry]}:table==='profiles'?{data:[{id:'s',email:box.email}]}:table==='mailbox_connections'?{data:[box]}:fail?{error:{message:'private failure'}}:{data:full?[incoming]:call.range[0]===0?[incoming,reply]:[]}).then(resolve,reject)}};return query}};
}
test('loader queries only authorized inquiry ids, no body/attachment/secrets, and reads later pages',async()=>{
 const client=mockClient();const r=await loadInquiryMailReplies(client,[inquiry,{id:'other',owner_id:'s2'}],{role:'sales',actorId:'s',pageSize:2});assert.equal(r.get('i').code,'replied');assert.equal(r.get('other').code,'restricted');
 for(const c of client.calls){assert.doesNotMatch(c.fields,/body|password|secret|attachment|\*/i);if(c.table==='email_messages')assert.deepEqual(c.inquiry_id,['i']);}
 assert.equal(client.calls.filter(c=>c.table==='email_messages').length,2);
});
test('market skips private sales communication; failures and truncated reads do not become zero replies',async()=>{
 const client=mockClient();assert.equal((await loadInquiryMailReplies(client,[inquiry],{role:'marketing'})).get('i').code,'restricted');assert.equal(client.calls.length,0);
 assert.equal((await loadInquiryMailReplies(mockClient({fail:true}),[inquiry],{role:'owner'})).get('i').code,'unavailable');
 assert.equal((await loadInquiryMailReplies(mockClient({full:true}),[inquiry],{role:'owner',pageSize:1,maxPages:1})).get('i').code,'partial');
});
test('both app entries load automatically, keep stale guards, and never invoke mail sending or forced sync',()=>{
 for(const file of ['index.html','grace.html']){const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.match(source,/id="detail-mail-reply-status"/);assert.match(source,/void refreshDetailMailReply\(inquiry\)/);assert.match(source,/void refreshInquiryMailList\(\)/);assert.match(source,/sequence!==mailListSequence/);assert.match(source,/sequence!==detailMailSequence/);}
 const source=fs.readFileSync(new URL('../assets/inquiry-mail-replies.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/\.invoke\(|\.insert\(|\.update\(|localStorage|service_role/);
});

test('later mailbox copies do not manufacture a new client response, and clock conflicts stay explicit',()=>{
 const copy={...incoming,id:'copied',received_at:'2026-11-26T05:00:00Z'};assert.equal(state([incoming,copy,reply]).code,'replied');
 assert.equal(state([copy,reply]).code,'time_conflict');
});
