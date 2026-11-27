import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {mergeConversation,bodyParts,paintConversation} from '../assets/inquiry-mail-conversation.mjs';
test('conversation uses actual message times, deduplicates copies and prefers readable complete bodies',()=>{
 const history={id:'h',message_id:'<a>',historical:true,received_at:'2026-11-01T08:00:00Z',body_text:'完整客户正文'};
 const live={id:'l',message_id:'a',received_at:'2026-11-01T08:00:00Z',body_text:''};
 const reply={id:'r',message_id:'reply',direction:'outbound',sent_at:'2026-11-02T08:00:00Z',body_text:'业务员回复'};
 let result=mergeConversation([reply,live],[history]);assert.equal(result.length,2);assert.equal(result[0].body_text,'完整客户正文');assert.equal(result[1].id,'r');
 result=mergeConversation([{...live,body_text:'最新完整正文'}],[history]);assert.equal(result[0].body_text,'最新完整正文');
});
test('quoted mail stays inside its own original email, never becomes a fabricated conversation turn',()=>{
 const text='确认尺寸后再报价。\n\nOn Mon, Buyer wrote:\n> 需要20套门';const result=bodyParts(text);assert.equal(result.text,'确认尺寸后再报价。');assert.match(result.quoted,/需要20套门/);assert.equal(mergeConversation([{id:'one',body_text:text}],[]).length,1);
});
class Node{constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.className=''}setAttribute(k,v){this[k]=v}append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}}
const allText=node=>[node.textContent,...node.children.map(c=>typeof c==='string'?c:allText(c))].join('\n');
test('plaintext bodies, visible sender/time, incomplete evidence and original expansion remain safe',()=>{
 const before=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};
 try{const host=new Node('div');paintConversation(host,[{id:'x',direction:'inbound',sender_email:'buyer@example.invalid',recipient_emails:['sales@example.invalid'],received_at:'2026-11-26T10:00:00Z',subject:'<img src=x onerror=bad()>',body_text:'<script>not executable</script>',historical:true,body_status:'unavailable'}]);
 const text=allText(host);assert.match(text,/buyer@example.invalid/);assert.match(text,/2026/);assert.match(text,/最近90天历史/);assert.match(text,/正文尚未取得/);assert.match(text,/<script>not executable<\/script>/);
 const tags=[];const walk=n=>{tags.push(n.tag);n.children.filter(c=>typeof c!=='string').forEach(walk)};walk(host);assert.ok(tags.includes('details'));assert.equal(tags.includes('script'),false);assert.equal(tags.includes('img'),false);
 }finally{globalThis.document=before}
});
test('three app paths keep historical content private and use the distinct mail conversation tab',()=>{
 for(const file of ['index.html','grace.html']){const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.match(source,/data-detail-tab="mail-conversation"/);assert.match(source,/mountInquiryConversation/);assert.match(source,/inquiryMailConversation\?\.clear/);}
 const module=fs.readFileSync(new URL('../assets/inquiry-mail-conversation.mjs',import.meta.url),'utf8');assert.doesNotMatch(module,/innerHTML\s*=\s*(?:m\.|.*body_text)|localStorage|sessionStorage|sendMail/);assert.match(module,/include_body:true/);
});

test('conversation timestamp is directional, original-header based, never import time; unknown sorts last',async()=>{
 const {conversationTime}=await import('../assets/inquiry-mail-conversation.mjs');
 const sent={id:'sent',direction:'outbound',sent_at:'2026-11-01T08:00:00Z',received_at:'2026-11-27T08:00:00Z',created_at:'2026-11-27T08:00:00Z'};
 assert.equal(conversationTime(sent),sent.sent_at);
 assert.equal(conversationTime({...sent,raw_headers:{original_date:'2026-10-30T08:00:00Z'}}),'2026-10-30T08:00:00Z');
 assert.equal(conversationTime({...sent,raw_headers:{date_source:'unavailable'}}),'');
 assert.equal(conversationTime({direction:'inbound',sent_at:sent.sent_at,created_at:sent.created_at}),'');
 assert.equal(conversationTime({direction:'outbound',created_at:sent.created_at,event_at:sent.created_at}),'');
 const rows=mergeConversation([{id:'unknown',created_at:'2020-01-01'},sent,{id:'old',direction:'inbound',received_at:'2026-10-01T08:00:00Z'}]);
 assert.deepEqual(rows.map(x=>x.id),['old','sent','unknown']);
});
