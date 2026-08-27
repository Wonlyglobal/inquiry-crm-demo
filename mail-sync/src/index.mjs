import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const interval=Math.max(30,Number(process.env.SYNC_INTERVAL_SECONDS||60))*1000;
const initialLimit=Math.max(10,Number(process.env.INITIAL_SYNC_LIMIT||100));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const cleanEmail=(v)=>String(v||'').trim().toLowerCase();
const normalizeSubject=(v)=>String(v||'').replace(/^\s*((re|fw|fwd|答复|回复|转发)\s*[:：]\s*)+/i,'').replace(/\s+/g,' ').trim().toLowerCase();
const addrList=(node)=>[...(node?.value||[])].map(x=>cleanEmail(x.address)).filter(Boolean);
const headerId=(v)=>String(v||'').trim().replace(/^<|>$/g,'');
const isSentFolder=(name)=>/sent|已发送|发件箱/i.test(name);
const isInstantlyNurturing=(message,connection)=>connection.mailbox_kind==='shared_inquiry'&&message.direction==='inbound'&&/\bchloe\b/i.test([
  message.sender_email,
  message.subject,
  message.body_text,
].filter(Boolean).join('\n'));

async function secretFor(id){const {data,error}=await db.rpc('read_mailbox_secret',{target_connection_id:id});if(error||!data)throw error||new Error('邮箱凭据不存在');return data}

async function matchInquiry(message, connection){
  const ids=[message.in_reply_to,...message.reference_ids,message.message_id].map(headerId).filter(Boolean);
  if(ids.length){
    const {data:prior}=await db.from('email_messages').select('inquiry_id').in('message_id',ids).not('inquiry_id','is',null).limit(1);
    if(prior?.[0]?.inquiry_id)return {id:prior[0].inquiry_id,method:'thread_header'};
    const {data:intake}=await db.from('email_intake').select('inquiry_id').in('message_id',ids).not('inquiry_id','is',null).limit(1);
    if(intake?.[0]?.inquiry_id)return {id:intake[0].inquiry_id,method:'original_message_id'};
    const {data:draft}=await db.from('outreach_drafts').select('inquiry_id').in('message_id',ids).limit(1);
    if(draft?.[0]?.inquiry_id)return {id:draft[0].inquiry_id,method:'outreach_message_id'};
  }
  const counterpart=message.direction==='inbound'?message.sender_email:message.recipient_emails[0];
  if(counterpart){
    let q=db.from('email_intake').select('inquiry_id,inquiries!inner(id,owner_id,title,created_at)').eq('sender_email',counterpart).not('inquiry_id','is',null).order('created_at',{ascending:false}).limit(10);
    const {data}=await q;
    const candidates=(data||[]).filter(x=>message.direction==='inbound'||x.inquiries?.owner_id===connection.user_id);
    const exact=candidates.find(x=>normalizeSubject(x.inquiries?.title)===normalizeSubject(message.subject));
    if(exact?.inquiry_id)return {id:exact.inquiry_id,method:'email_and_subject'};
    if(candidates.length===1)return {id:candidates[0].inquiry_id,method:'unique_contact_email'};
  }
  return {id:null,method:null};
}

async function createInquiryFromShared(message, connection){
  if(connection.mailbox_kind!=='shared_inquiry'||message.direction!=='inbound')return null;
  const creator=connection.created_by;
  const domain=message.sender_email.split('@')[1]||null;
  let companyId=null,contactId=null;
  if(domain){const {data:c}=await db.from('companies').select('id').ilike('domain',domain).maybeSingle();companyId=c?.id||null}
  if(!companyId){const {data:c}=await db.from('companies').insert({name:domain||message.sender_email,domain,created_by:creator}).select('id').single();companyId=c?.id||null}
  const {data:existing}=await db.from('contacts').select('id').eq('email',message.sender_email).maybeSingle();contactId=existing?.id||null;
  if(!contactId){const {data:c}=await db.from('contacts').insert({company_id:companyId,email:message.sender_email,created_by:creator}).select('id').single();contactId=c?.id||null}
  const {data:inq,error}=await db.from('inquiries').insert({company_id:companyId,contact_id:contactId,title:message.subject||`来自 ${message.sender_email} 的邮件询盘`,source:'email',original_message:message.body_text||'',status:'pending_assignment',created_by:creator,updated_by:creator,last_change_reason:'公共询盘邮箱自动收件'}).select('id').single();
  if(error)throw error;
  await db.from('email_intake').insert({message_id:message.message_id||null,sender_email:message.sender_email,recipient_email:connection.email,subject:message.subject,body_text:message.body_text||'',received_at:message.received_at,processing_status:'pending_review',inquiry_id:inq.id,created_by:creator});
  const {data:markets}=await db.from('profiles').select('id').eq('role','marketing').eq('active',true);
  if(markets?.length)await db.from('notifications').insert(markets.map(p=>({recipient_id:p.id,inquiry_id:inq.id,type:'new_inquiry_email',title:'收到新的邮件询盘',body:`${message.sender_email} · ${message.subject||'无主题'}`})));
  return {id:inq.id,method:'shared_mailbox_created'};
}

function ruleSummary(message){
  const direction=message.direction==='inbound'?'客户来信':'业务员发信';
  const body=String(message.body_text||'').replace(/\s+/g,' ').trim().slice(0,600);
  return `${direction}：${message.subject||'无主题'}${body?`。内容摘要：${body}`:''}`;
}

async function applyMatchedMessage(row, connection){
  const {data:inq}=await db.from('inquiries').select('id,owner_id,title').eq('id',row.inquiry_id).single();
  if(!inq)return;
  const author=inq.owner_id||connection.user_id||connection.created_by;
  await db.from('follow_ups').upsert({inquiry_id:inq.id,author_id:author,method:'email',content:row.body_text||row.subject||'邮件沟通',customer_feedback:row.direction==='inbound'?(row.body_text||null):null,source:'email_sync',direction:row.direction,email_message_id:row.id},{onConflict:'email_message_id',ignoreDuplicates:true});
  if(row.direction==='outbound'){
    await db.from('inquiries').update({first_valid_contact_at:new Date(row.sent_at||row.created_at).toISOString(),updated_by:author,last_change_reason:'从已发送邮件同步首次有效联系'}).eq('id',inq.id).is('first_valid_contact_at',null);
  }else{
    const {data:managers}=await db.from('profiles').select('id').eq('role','sales_manager').eq('active',true);
    const recipients=[inq.owner_id,...(managers||[]).map(x=>x.id)].filter(Boolean);
    if(recipients.length)await db.from('notifications').insert([...new Set(recipients)].map(id=>({recipient_id:id,inquiry_id:inq.id,type:'customer_email_reply',title:'客户有新邮件回复',body:`${row.sender_email||''} · ${row.subject||inq.title}`})));
  }
  await db.from('communication_summaries').insert({inquiry_id:inq.id,source_message_id:row.id,summary_zh:ruleSummary(row),latest_customer_request:row.direction==='inbound'?(row.body_text||'').slice(0,2000):null,provider:'rules'});
  try{
    const response=await fetch(`${url}/functions/v1/email-communication-ai`,{method:'POST',headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'},body:JSON.stringify({message_id:row.id}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)console.error(`AI summary ${row.id}: ${await response.text()}`);
  }catch(error){console.error(`AI summary ${row.id}:`,error?.message||error)}
}

async function syncFolder(connection,password,folder){
  console.log(`${connection.email} syncing ${folder}`);
  const client=new ImapFlow({host:connection.imap_host,port:connection.imap_port,secure:true,auth:{user:connection.email,pass:password},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:45000});
  await client.connect();
  try{
    const lock=await client.getMailboxLock(folder);
    try{
      const {data:cursor}=await db.from('email_sync_cursors').select('*').eq('mailbox_connection_id',connection.id).eq('folder',folder).maybeSingle();
      const uidValidity=String(client.mailbox.uidValidity||'');
      const last=cursor?.uid_validity===uidValidity?Number(cursor.last_uid||0):0;
      // A newly connected mailbox starts at its current newest message. This
      // prevents old mailbox history from being imported as fresh CRM work.
      if(!cursor&&(isSentFolder(folder)||connection.mailbox_kind==='shared_inquiry')){
        const baseline=Math.max(0,Number(client.mailbox.uidNext||1)-1);
        await db.from('email_sync_cursors').upsert({mailbox_connection_id:connection.id,folder,uid_validity:uidValidity,last_uid:baseline,last_synced_at:new Date().toISOString(),last_error:null},{onConflict:'mailbox_connection_id,folder'});
        console.log(`${connection.email} initialized ${folder} at UID ${baseline}`);
        return;
      }
      const start=last?last+1:Math.max(1,Number(client.mailbox.uidNext||1)-initialLimit);
      let maxUid=last;
      for await(const msg of client.fetch(`${start}:*`,{uid:true,source:{start:0,maxLength:2_000_000},envelope:true,headers:['message-id','in-reply-to','references']})){
        if(msg.uid<=last)continue;
        maxUid=Math.max(maxUid,msg.uid);
        const parsed=await simpleParser(msg.source);
        const sent=isSentFolder(folder);
        const references=Array.isArray(parsed.references)?parsed.references:(parsed.references?[parsed.references]:[]);
        const record={mailbox_connection_id:connection.id,folder,uid:msg.uid,message_id:headerId(parsed.messageId),in_reply_to:headerId(parsed.inReplyTo),reference_ids:references.map(headerId),direction:sent?'outbound':'inbound',sender_email:cleanEmail(parsed.from?.value?.[0]?.address),recipient_emails:addrList(parsed.to),cc_emails:addrList(parsed.cc),subject:parsed.subject||'',body_text:parsed.text||'',body_html:typeof parsed.html==='string'?parsed.html:'',sent_at:sent?(parsed.date||new Date()).toISOString():null,received_at:sent?null:(parsed.date||new Date()).toISOString(),attachment_count:parsed.attachments?.length||0,raw_headers:{message_id:parsed.messageId||null,in_reply_to:parsed.inReplyTo||null,references}};
        const nurturing=isInstantlyNurturing(record,connection);
        let match=nurturing?{id:null,method:'instantly_chloe_filter'}:await matchInquiry(record,connection);
        if(!nurturing&&!match.id)match=await createInquiryFromShared(record,connection)||match;
        const {data:row,error}=await db.from('email_messages').upsert({...record,inquiry_id:match.id,association_status:nurturing?'ignored':match.id?'matched':'pending',association_method:match.method},{onConflict:'mailbox_connection_id,folder,uid'}).select('*').single();
        if(error)throw error;if(row?.inquiry_id)await applyMatchedMessage(row,connection);
      }
      await db.from('email_sync_cursors').upsert({mailbox_connection_id:connection.id,folder,uid_validity:uidValidity,last_uid:maxUid,last_synced_at:new Date().toISOString(),last_error:null},{onConflict:'mailbox_connection_id,folder'});
      console.log(`${connection.email} finished ${folder} at UID ${maxUid}`);
    }finally{lock.release()}
  }finally{await client.logout().catch(()=>{})}
}

async function syncMailbox(connection){
  const password=await secretFor(connection.id);
  const probe=new ImapFlow({host:connection.imap_host,port:connection.imap_port,secure:true,auth:{user:connection.email,pass:password},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:45000});
  await probe.connect();const boxes=await probe.list();await probe.logout();
  const inbox=boxes.find(x=>x.specialUse==='\\Inbox')?.path||'INBOX';
  const sent=boxes.find(x=>x.specialUse==='\\Sent')?.path||boxes.find(x=>isSentFolder(x.path))?.path;
  for(const folder of [inbox,sent].filter(Boolean))await syncFolder(connection,password,folder);
  await db.from('mailbox_connections').update({last_synced_at:new Date().toISOString(),error_message:null,status:'connected'}).eq('id',connection.id);
}

async function cycle(){
  const {data,error}=await db.from('mailbox_connections').select('*').eq('status','connected').eq('sync_enabled',true);if(error)throw error;
  await Promise.allSettled((data||[]).map(async connection=>{try{await syncMailbox(connection);console.log(`${connection.email} synced`)}catch(error){console.error(connection.email,error);await db.from('mailbox_connections').update({error_message:String(error?.message||error).slice(0,1000)}).eq('id',connection.id)}}));
  await writeFile('/tmp/healthy',new Date().toISOString());
}

while(true){try{await cycle()}catch(error){console.error(error)}await sleep(interval)}
