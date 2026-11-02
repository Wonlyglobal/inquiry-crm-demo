import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {searchQuery,matchesOriginal,reviewFolders,persistCandidate,recoverNextMailbox} from '../supabase/functions/mail-source-recovery/recovery.mjs';
const task={reminder_id:'notice',row:'1',sender:'Buyer <buyer@example.test>',subject:'Re: Door enquiry',at:'Tue, 15 Sep 2026 03:34:09 +0800'};
const parsed={messageId:'<original@example.test>',subject:'Door enquiry',date:new Date(task.at),from:{value:[{address:'buyer@example.test'}]},text:'Synthetic original',attachments:[]};
const connection={id:'box',email:'sales@example.test',user_id:'sales',status:'connected',sync_enabled:true,imap_host:'imap.example.test',imap_port:993};
function fixture({existing=[],risk=null,blockedProfile=false,zero=false}={}){
 const writes=[],calls=[],messages=[...existing],files=[],uploads=[];
 const job={id:'job',batch_id:'batch',mailbox_id:'box',lease_id:'lease',tasks:[task],previous_result:{}};
 const db={
  async rpc(name,args){calls.push({name,args});return {data:name==='claim_mail_source_recovery'?job:name==='read_mailbox_secret'?'synthetic-secret':null,error:null}},
  from(table){
   const filters=[];let payload,options,mode='select';
   const chain={
    select(){return chain},eq(k,v){filters.push([k,v]);return chain},limit(){return chain},single(){return chain},maybeSingle(){return chain},
    upsert(p,o){mode='upsert';payload=p;options=o;writes.push({table,payload,options});return chain},
    then(resolve,reject){try{
     let data;
     if(table==='mailbox_connections')data=connection;
     else if(table==='profiles')data={active:!blockedProfile,is_test_data:false,data_environment:'production'};
     else if(table==='risk_user_controls')data=risk;
     else if(table==='email_messages'){
      if(mode==='upsert'){assert.equal(options.ignoreDuplicates,true);data={...payload,id:'stored',inquiry_id:null};messages.push(data)}
      else {const list=messages.filter(x=>filters.every(([k,v])=>k==='mailbox_connection_id'||x[k]===v));data=filters.some(([k])=>k==='uid')?list[0]||null:list}
     }else if(table==='email_attachments')data=files;
     resolve({data,error:null});
    }catch(e){reject(e)}}
   };
   return chain;
  },
  storage:{from(){return {async upload(path,bytes,options){uploads.push({path,options});return {error:null}}}}}
 };

 const imap={async connect(){},async list(){return [{path:'INBOX',flags:new Set()}]},async getMailboxLock(path,options){calls.push({lock:path,options});return {release(){}}},async search(query,options){calls.push({query,options});return zero?[]:[42]},async *fetch(){yield {uid:42,size:100,envelope:{subject:'Door enquiry'}}},async fetchOne(){return {source:new TextEncoder().encode('synthetic MIME')}},async logout(){}};
 return {db,writes,calls,uploads,imap};
}
test('search is frozen by sender and date; exact decoded identity and subject must match',()=>{
 const q=searchQuery(task);assert.equal(q.from,'buyer@example.test');assert.equal(q.subject,task.subject);assert.ok(q.before>q.since);
 assert.equal(matchesOriginal(parsed,task),true);assert.equal(matchesOriginal({...parsed,subject:'other'},task),false);
 assert.equal(matchesOriginal({...parsed,from:{value:[{address:'other@example.test'}]}},task),false);
 assert.equal(matchesOriginal({...parsed,date:new Date('2026-10-01')},task),false);
 assert.equal(matchesOriginal({...parsed,date:new Date(+parsed.date+16*60000)},task),false);
 assert.throws(()=>searchQuery({...task,at:'bad'}));
});
test('all selectable original folders including junk and trash are checked without selecting drafts',()=>{
 assert.deepEqual(reviewFolders([{path:'INBOX'},{path:'Junk'},{path:'Trash'},{path:'Drafts',specialUse:'\\Drafts'},{path:'Root',flags:new Set(['\\Noselect'])}]),['INBOX','Junk','Trash']);
});
test('recovery selects read-only and only saves an unassigned restricted source, never an inquiry or intake',async()=>{
 const f=fixture();const result=await recoverNextMailbox({db:f.db,createImap:()=>f.imap,parseMail:async()=>parsed,deadline:Date.now()+10000});
 assert.equal(result.state,'completed');assert.equal(result.recovered,1);
 assert.ok(f.calls.filter(x=>x.lock).every(x=>x.options.readOnly));
 const row=f.writes.find(x=>x.table==='email_messages');assert.equal(row.payload.inquiry_id,null);assert.equal(row.payload.association_status,'ignored');assert.equal(row.payload.association_method,'source_recovery_review');
 assert.ok(f.writes.every(x=>['email_messages','email_attachments'].includes(x.table)));
 assert.doesNotMatch(JSON.stringify(result),/buyer@example|synthetic-secret|Synthetic original/);
});
test('existing linked source is reused without overwriting association, text or fields',async()=>{
 const f=fixture({existing:[{id:'old',message_id:'original@example.test',sender_email:'buyer@example.test',subject:'Door enquiry',body_text:parsed.text,inquiry_id:'existing-inquiry'}]});
 const r=await persistCandidate({db:f.db,parsed,source:new Uint8Array([1]),connection,folder:'Junk',uid:1});
 assert.equal(r.message_id,'old');assert.equal(r.existing_inquiry_id,'existing-inquiry');assert.equal(f.writes.length,0);
});
test('same Message-ID with conflicting content is not silently reused or overwritten',async()=>{
 const f=fixture({existing:[{id:'old',message_id:'original@example.test',sender_email:'buyer@example.test',subject:'Door enquiry',body_text:'different',inquiry_id:'existing-inquiry'}]});
 assert.equal((await persistCandidate({db:f.db,parsed,source:new Uint8Array([1]),connection,folder:'Junk',uid:1})).state,'source_conflict');assert.equal(f.writes.length,0);
});
test('attachments are never executed; unsafe files are blocked and safe writes cannot replace existing objects',async()=>{
 const f=fixture();const r=await persistCandidate({db:f.db,parsed:{...parsed,attachments:[{filename:'unsafe.cmd',content:new Uint8Array([1])},{filename:'list.xlsx',content:new Uint8Array([2])}]},source:new Uint8Array([1]),connection,folder:'Junk',uid:1});
 assert.equal(r.attachments[0].state,'blocked_type_or_size');assert.equal(r.attachments[1].state,'saved');assert.equal(f.uploads.length,1);assert.equal(f.uploads[0].options.upsert,false);
});
test('risk download block stops before credentials or original mailbox access',async()=>{
 const f=fixture({risk:{download_suspended:true}});const r=await recoverNextMailbox({db:f.db,createImap:()=>{throw Error('must not access IMAP')},parseMail:async()=>parsed,deadline:Date.now()+10000});
 assert.equal(r.state,'blocked');assert.ok(!f.calls.some(x=>x.name==='read_mailbox_secret'));assert.equal(f.writes.length,0);
});
test('empty search is a checked absence; deadline gives partial rather than false completion',async()=>{
 const f=fixture({zero:true});const r=await recoverNextMailbox({db:f.db,createImap:()=>f.imap,parseMail:async()=>parsed,deadline:Date.now()+10000});assert.equal(r.state,'completed');assert.equal(r.recovered,0);
 const g=fixture();const partial=await recoverNextMailbox({db:g.db,createImap:()=>g.imap,parseMail:async()=>parsed,deadline:1});assert.equal(partial.state,'partial');assert.equal(g.writes.length,0);
});
test('handler uses existing dedicated token before service access and accepts no arbitrary search body',async()=>{
 const s=await readFile(new URL('../supabase/functions/mail-source-recovery/index.ts',import.meta.url),'utf8');assert.match(s,/request.method!=="POST"/);assert.ok(s.indexOf('x-mail-sync-token')<s.indexOf('createClient(Deno.env'));assert.doesNotMatch(s,/request.json|request.text|console.log|fetch\(/);
});
