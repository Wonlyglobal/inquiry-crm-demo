const clean=v=>String(v||'').trim().toLowerCase();
const id=v=>String(v||'').trim().replace(/^<|>$/g,'');
export const normalizeSubject=v=>String(v||'').replace(/^\s*((re|fw|fwd|回复|答复|转发)\s*[:：]\s*)+/i,'').replace(/\s+/g,' ').trim().toLowerCase();
const address=v=>clean(String(v||'').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]);
const safeName=(v,i)=>String(v||`attachment-${i+1}`).replace(/[^a-zA-Z0-9._()\-\u4e00-\u9fff]/g,'_').slice(0,180);
const addrList=node=>(node?.value||[]).map(x=>clean(x.address)).filter(Boolean);
const safeExtension=name=>/\.(?:pdf|xlsx?|csv|txt|docx|png|jpe?g|eml)$/i.test(name);
const queryData=async query=>{const r=await query;if(r.error)throw r.error;return r.data};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function searchQuery(task){
 const at=new Date(task.at);if(!Number.isFinite(+at)||!address(task.sender)||!normalizeSubject(task.subject))throw Error('invalid_frozen_search_task');
 return {from:address(task.sender),subject:task.subject,sentSince:new Date(+at-3*86400_000),sentBefore:new Date(+at+4*86400_000)};
}
export function matchesOriginal(parsed,task){
 return clean(parsed.from?.value?.[0]?.address)===address(task.sender)
  && normalizeSubject(parsed.subject)===normalizeSubject(task.subject)
  && Number.isFinite(+parsed.date)&&Math.abs(+parsed.date-+new Date(task.at))<=15*60_000;
}
export function reviewFolders(boxes){
 return [...new Set(boxes.filter(b=>!b.flags?.has('\\Noselect')&&!/\\Drafts/i.test(b.specialUse||'')&&!/(?:^|[./])(?:drafts?|草稿箱|待发送)(?:$|[./])/i.test(b.path)).map(b=>b.path))];
}
export async function persistCandidate({db,parsed,source,connection,folder,uid}){
 const messageId=id(parsed.messageId),sender=clean(parsed.from?.value?.[0]?.address),body=parsed.text||'';
 let existing=null;
 if(messageId){
  const candidates=await queryData(db.from('email_messages').select('id,message_id,sender_email,subject,body_text,inquiry_id').eq('mailbox_connection_id',connection.id).eq('message_id',messageId).limit(10));
  existing=candidates?.find(x=>clean(x.sender_email)===sender&&normalizeSubject(x.subject)===normalizeSubject(parsed.subject)&&x.body_text===body);
  if(candidates?.length&&!existing)return {state:'source_conflict',source_hash:await digest(source)};
 }
 if(!messageId){
  const candidates=await queryData(db.from('email_messages').select('id,message_id,sender_email,subject,body_text,inquiry_id').eq('mailbox_connection_id',connection.id).eq('sender_email',sender).eq('subject',parsed.subject||'').limit(20));
  existing=candidates?.find(x=>x.body_text===body);
 }
 if(!existing){
  const at=(parsed.date||new Date()).toISOString(),references=Array.isArray(parsed.references)?parsed.references:parsed.references?[parsed.references]:[];
  const record={mailbox_connection_id:connection.id,folder,uid,message_id:messageId,in_reply_to:id(parsed.inReplyTo),reference_ids:references.map(id),direction:sender===clean(connection.email)?'outbound':'inbound',sender_email:sender,recipient_emails:addrList(parsed.to),cc_emails:addrList(parsed.cc),subject:parsed.subject||'',body_text:body,body_html:typeof parsed.html==='string'?parsed.html:'',sent_at:sender===clean(connection.email)?at:null,received_at:sender===clean(connection.email)?null:at,inquiry_id:null,association_status:'ignored',association_method:'source_recovery_review',attachment_count:parsed.attachments?.length||0,raw_headers:{message_id:parsed.messageId||null,in_reply_to:parsed.inReplyTo||null,references}};
  existing=await queryData(db.from('email_messages').upsert(record,{onConflict:'mailbox_connection_id,folder,uid',ignoreDuplicates:true}).select('id,message_id,sender_email,subject,body_text,inquiry_id').maybeSingle());
  if(!existing)existing=await queryData(db.from('email_messages').select('id,message_id,sender_email,subject,body_text,inquiry_id').eq('mailbox_connection_id',connection.id).eq('folder',folder).eq('uid',uid).maybeSingle());
  if(!existing||id(existing.message_id)!==messageId||clean(existing.sender_email)!==sender||existing.body_text!==body)return {state:'uid_conflict',source_hash:await digest(source)};
 }
 const saved=await queryData(db.from('email_attachments').select('id,file_name,size_bytes,storage_path').eq('email_message_id',existing.id));
 const attachments=[];
 for(const [i,a] of (parsed.attachments||[]).entries()){
  const name=safeName(a.filename,i),size=a.content?.length||0;
  if(!safeExtension(name)||!size||size>10*1024*1024){attachments.push({index:i,state:'blocked_type_or_size',size});continue}
  if(saved?.some(x=>x.file_name===name&&x.size_bytes===size)){attachments.push({index:i,state:'existing_unmodified',size});continue}
  const path=`${existing.id}/${i}-${name}`;
  const upload=await db.storage.from('email-attachments').upload(path,a.content,{upsert:false,contentType:a.contentType||'application/octet-stream'});
  if(upload.error){attachments.push({index:i,state:'storage_unavailable',size});continue}
  const row={email_message_id:existing.id,file_name:name,content_type:a.contentType||null,size_bytes:size,storage_path:path,content_id:a.contentId||null,inline:a.contentDisposition==='inline'};
  await queryData(db.from('email_attachments').upsert(row,{onConflict:'storage_path',ignoreDuplicates:true}));
  attachments.push({index:i,state:'saved',size,sha256:await digest(a.content)});
 }
 return {state:'recovered',message_id:existing.id,existing_inquiry_id:existing.inquiry_id||null,source_hash:await digest(source),header_id_hash:await digest(new TextEncoder().encode(messageId)),attachments};
}
export async function recoverNextMailbox({db,createImap,parseMail,deadline,now=()=>Date.now()}){
 const claim=await db.rpc('claim_mail_source_recovery');if(claim.error)throw claim.error;const job=claim.data;if(!job)return {ok:true,jobs:0};
 const items=[...(job.previous_result?.items||[])];let client,finalState='failed',failure='none',stage='connection_lookup';
 try{
  const connection=await queryData(db.from('mailbox_connections').select('id,email,user_id,created_by,mailbox_kind,status,sync_enabled,imap_host,imap_port').eq('id',job.mailbox_id).single());
  if(connection.status!=='connected'||!connection.sync_enabled)throw Error('mailbox_unavailable');
  stage='account_controls';
  const profile=await queryData(db.from('profiles').select('active,is_test_data,data_environment').eq('id',connection.user_id||connection.created_by).single());
  const control=await queryData(db.from('risk_user_controls').select('download_suspended,sensitive_reveal_suspended').eq('user_id',connection.user_id||connection.created_by).maybeSingle());
  if(!profile.active||profile.is_test_data||profile.data_environment!=='production'||control?.download_suspended||control?.sensitive_reveal_suspended){finalState='blocked';failure='account_or_risk_control';}
  else{
   stage='credential_lookup';
   const secret=await db.rpc('read_mailbox_secret',{target_connection_id:connection.id});if(secret.error||!secret.data)throw Error('mailbox_secret_unavailable');
   client=createImap({host:connection.imap_host,port:connection.imap_port,secure:true,auth:{user:connection.email,pass:secret.data},logger:false,connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000});
   stage='imap_connect';await client.connect();stage='imap_folders';const boxes=await client.list();const allFolders=reviewFolders(boxes),folders=allFolders.slice(0,20);let incomplete=allFolders.length>20;
   for(const task of job.tasks){
    const key=`${task.reminder_id}:${task.row}`;let item=items.find(x=>x.key===key);if(!item){item={key,state:'partial',searched_folders:[],candidates:[],issues:[]};items.push(item)}
    if(item.state!=='partial')continue;
    const query=searchQuery(task);
    for(const folder of folders){
     if(item.searched_folders.includes(folder))continue;
     if(now()>=deadline){incomplete=true;break}
     const lock=await client.getMailboxLock(folder,{readOnly:true});
     try{
      stage='imap_search';let uids=await client.search(query,{uid:true})||[];
      if(!uids.length)uids=await client.search({from:query.from,subject:query.subject},{uid:true})||[];
      if(uids.length>100){item.issues.push('candidate_limit');incomplete=true;continue}
      if(uids.length)for await(const meta of client.fetch(uids,{uid:true,size:true,envelope:true},{uid:true})){
       if(now()>=deadline){incomplete=true;break}
       if(meta.envelope&&normalizeSubject(meta.envelope.subject)!==normalizeSubject(task.subject))continue;
       if(meta.envelope?.date&&Math.abs(+new Date(meta.envelope.date)-+new Date(task.at))>15*60_000){item.issues.push('same_sender_subject_different_time');continue}
       if(meta.size>20*1024*1024){item.issues.push('message_size_limit');continue}
       stage='imap_fetch';const fetched=await client.fetchOne(meta.uid,{uid:true,source:{maxLength:20*1024*1024+1}},{uid:true});
       if(!fetched?.source||fetched.source.length>20*1024*1024){item.issues.push('message_size_limit');continue}
       stage='mime_parse';const parsed=await parseMail(fetched.source);
       if(!matchesOriginal(parsed,task)){
        if(clean(parsed.from?.value?.[0]?.address)===address(task.sender)&&normalizeSubject(parsed.subject)===normalizeSubject(task.subject))item.issues.push('same_sender_subject_different_time');
        continue;
       }
       stage='source_persist';const result=await persistCandidate({db,parsed,source:fetched.source,connection,folder,uid:meta.uid});
       if(!item.candidates.some(x=>x.message_id&&x.message_id===result.message_id))item.candidates.push(result);
      }
      if(now()<deadline&&!item.issues.includes('candidate_limit'))item.searched_folders.push(folder);
     }finally{lock.release()}
    }
    if(item.searched_folders.length===folders.length)item.state=item.candidates.some(x=>x.state==='recovered')?'found':item.issues.length?'unconfirmed':'not_found';else incomplete=true;
   }
   finalState=incomplete||items.some(x=>x.state==='partial')?'partial':'completed';
  }
 }catch(error){failure=['EAUTH','AUTHENTICATIONFAILED','ETIMEDOUT','ECONNREFUSED','ENOTFOUND','42P01','23505','42501'].includes(error?.code)?error.code:error?.name==='Error'?'mailbox_or_storage_error':'transport_or_database_error';finalState='failed';}
 finally{
  if(client)await client.logout().catch(()=>{});
  const result={items,failure,last_stage:stage,search_version:'header-date-v2',source_records:items.reduce((n,x)=>n+x.candidates.filter(c=>c.state==='recovered').length,0)};
  const done=await db.rpc('finish_mail_source_recovery',{target_job:job.id,target_lease:job.lease_id,final_state:finalState,result_data:result});if(done.error)throw done.error;
 }
 return {ok:finalState==='completed',jobs:1,state:finalState,items:items.length,recovered:items.filter(x=>x.state==='found').length};
}
