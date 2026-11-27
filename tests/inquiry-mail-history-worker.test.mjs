import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {anchorIds,linkedToAnchor,historyFolders,safeBody,textBodyPart,boundedRead,processHistoryChunk} from '../supabase/functions/inquiry-mail-history/history.mjs';
test('exact message headers anchor one inquiry, never subject/contact similarity or substring search hits',()=>{
 assert.deepEqual(anchorIds([{message_id:'<root>'}],[{message_id:'root'}],[{provider_message_id:'<delivered-forward>'}]),['root','delivered-forward']);
 assert.ok(linkedToAnchor({inReplyTo:'<root>'},['root']));assert.ok(linkedToAnchor({references:['earlier','<root>']},['root']));
 assert.equal(linkedToAnchor({messageId:'root-elsewhere',subject:'same',sender:'same'},['root']),false);
 const folders=historyFolders([{path:'INBOX'},{path:'Sent Items',specialUse:'\\Sent'},{path:'Outbox'},{path:'Drafts'}]);assert.deepEqual(folders,[{path:'INBOX',direction:'inbound'},{path:'Sent Items',direction:'outbound'}]);
});
test('capacity-limited body keeps an explicit incomplete marker and never returns attachments',()=>{
 const body=safeBody({text:'x'.repeat(70000),attachments:[{content:'private'}]},100);assert.equal(body.body_text.length,65536);assert.equal(body.body_status,'truncated');assert.equal('attachments' in body,false);
 assert.doesNotMatch(safeBody({html:'<script>bad</script><p>客户</p>'},100).body_text,/bad|script/);
});
function harness({scopeChanges=false,failConnect=false,noAnchor=false,duplicate=false}={}){
 const calls=[],writes=[],finishes=[];let inquiryReads=0;const job={id:'job',request_id:'request',connection_id:'box',lease_token:'lease',attempts:0,cursor:{},counts:{}};
 function query(table){const q={select(fields){calls.push(['select',table,fields]);return this},eq(){return this},order(){return this},limit(){return this},single(){return this},upsert(record,options){writes.push({record,options});return this},then(resolve,reject){let data;if(table==='inquiries'){inquiryReads++;data={id:'inquiry',owner_id:scopeChanges&&inquiryReads>1?'changed':'sales'}}else if(table==='mailbox_connections')data={id:'box',user_id:'sales',email:'s@example.invalid',mailbox_kind:'personal',status:'connected',sync_enabled:true,imap_host:'imap.qiye.aliyun.com',imap_port:993};else if(table==='email_messages')data=noAnchor?[]:[{message_id:'root'}];else if(table==='email_intake')data=[];else if(table==='integration_events')data=noAnchor?[]:[{provider_message_id:'<delivered-forward>'}];else if(table==='inquiry_mail_history')data=duplicate?[]:[{id:'saved'}];return Promise.resolve({data}).then(resolve,reject)}};return q;}
 const admin={from:query,rpc(name,args){calls.push(['rpc',name]);return Promise.resolve({data:name==='claim_inquiry_mail_history'?{job,inquiry_id:'inquiry',owner_id:'sales',window_from:'2026-08-29T00:00:00Z',window_to:'2026-11-27T00:00:00Z'}:name==='read_mailbox_secret'?'synthetic-only':name==='append_inquiry_mail_history'?(writes.push({record:args.message_data}),duplicate?null:'saved'):(finishes.push(args),null)})}};
 class Imap{
  constructor(options){assert.equal(options.logger,false);assert.equal(options.secure,true)}async connect(){if(failConnect)throw Error('private diagnostic must not escape')}
  async list(){return[{path:'INBOX'},{path:'Sent',specialUse:'\\Sent'}]}
  async getMailboxLock(path,opts){calls.push(['lock',path,opts]);this.mailbox={uidValidity:100};return{release(){calls.push(['release'])}}}
  async search(search,options){calls.push(['search',search,options]);return[1,2]}
  async fetchOne(uid,query,options){calls.push(['fetchOne',uid,query,options]);if(query.source)return{source:Buffer.from('full-body')};return{uid,size:100,bodyStructure:{type:'text/plain',part:'1'},internalDate:new Date('2026-11-01T01:00:00Z'),headers:Buffer.from(uid===1?'matched':'not-matched'),envelope:{from:[{address:'buyer@example.invalid'}],to:[{address:'s@example.invalid'}],subject:'Inquiry',messageId:'<other>'}}}
  async download(uid,part,options){calls.push(['download',uid,part,options]);return{content:(async function*(){yield Buffer.from('客户原始正文')})()}}
  async logout(){calls.push(['logout'])}
 }
 const simpleParser=async source=>source.toString()==='full-body'?{text:'客户原始正文',attachments:[{content:'not-stored'}]}:source.toString()==='matched'?{inReplyTo:'<root>',messageId:'<message>'}:{messageId:'root-substring-only'};
 return{args:{admin,userClient:{from:query},actorId:'sales',requestId:'request',ImapFlow:Imap,simpleParser},calls,writes,finishes};
}
test('90-day backfill only persists exact matched source; read-only IMAP and no live-mail writes',async()=>{
 const h=harness();const result=await processHistoryChunk(h.args);assert.equal(result.progress.status,'queued');assert.equal(h.writes.length,1);assert.equal(h.writes[0].record.body_text,'客户原始正文');assert.equal(h.writes[0].record.inquiry_id,'inquiry');assert.ok(h.calls.some(c=>c[0]==='rpc'&&c[1]==='append_inquiry_mail_history'));assert.equal(h.writes[0].record.body_truncated,false);
 assert.ok(h.calls.some(x=>x[0]==='search'&&x[1].or[0].header['message-id']==='delivered-forward'));assert.deepEqual(h.calls.find(x=>x[0]==='lock')[2],{readOnly:true});assert.equal(h.calls.filter(x=>x[0]==='download').length,1);assert.equal(h.calls.some(x=>x[0]==='fetchOne'&&x[2].source),false);assert.equal(h.finishes[0].new_cursor.folderIndex,1);
 assert.equal(h.calls.some(x=>x[0]==='select'&&['follow_ups','notifications','mail_outbox'].includes(x[1])),false);assert.equal(JSON.stringify(result).includes('synthetic-only'),false);
});
test('scope changes cancel before body read/store; absent anchors and generic network failures stay explicit',async()=>{
 let h=harness({scopeChanges:true});assert.equal((await processHistoryChunk(h.args)).progress.status,'cancelled');assert.equal(h.writes.length,0);assert.equal(h.calls.some(x=>x[0]==='download'),false);
 h=harness({noAnchor:true});assert.equal((await processHistoryChunk(h.args)).progress.error_code,'no_thread_anchor');assert.equal(h.calls.some(x=>x[0]==='rpc'&&x[1]==='read_mailbox_secret'),false);
 h=harness({failConnect:true});const r=await processHistoryChunk(h.args);assert.equal(r.progress.error_code,'read_failed');assert.equal(JSON.stringify(r).includes('private diagnostic'),false);
 h=harness({duplicate:true});assert.equal((await processHistoryChunk(h.args)).progress.counts.stored,0);
});
test('worker cannot send SMTP, invoke AI, mutate live mail or change existing sync cursors',()=>{
 const core=fs.readFileSync(new URL('../supabase/functions/inquiry-mail-history/history.mjs',import.meta.url),'utf8');assert.doesNotMatch(core,/nodemailer|sendMail|functions\.invoke|communication_summaries|email_sync_cursors|from\(['"]email_messages['"]\)\.(?:insert|update|upsert)/);
 const handler=fs.readFileSync(new URL('../supabase/functions/inquiry-mail-history/index.ts',import.meta.url),'utf8');assert.match(handler,/auth\.getUser\(\)/);assert.match(handler,/withReadOnlyGuard/);assert.match(handler,/MAIL_SYNC_WORKER_TOKEN/);assert.match(handler,/input\.days!==90/);
});

test('body selection never downloads attachment parts, preferring plain text to HTML',()=>{const part=textBodyPart({type:'multipart/mixed',childNodes:[{type:'text/plain',part:'1',disposition:'attachment'},{type:'text/html',part:'2'},{type:'text/plain',part:'3'}]});assert.equal(part.part,'3');assert.equal(textBodyPart({type:'application/pdf',part:'1'}),null)});

test('a stalled IMAP operation is stopped before its lease, without leaking diagnostics',async()=>{
 let closed=0;await assert.rejects(()=>boundedRead(()=>new Promise(()=>{}),5,()=>closed++),/history_io_timeout/);assert.equal(closed,1);
 const h=harness();let closeCount=0;
 h.args.ImapFlow=class extends h.args.ImapFlow{async connect(){return new Promise(()=>{})}close(){closeCount++}};h.args.ioTimeoutMs=5;
 const result=await processHistoryChunk(h.args);assert.equal(result.progress.status,'queued');assert.equal(result.progress.error_code,'read_failed');assert.equal(h.writes.length,0);assert.ok(closeCount>=1);assert.equal(h.finishes.length,1);
});
