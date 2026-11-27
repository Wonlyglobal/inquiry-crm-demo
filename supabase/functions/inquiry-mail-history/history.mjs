import {Buffer} from 'node:buffer';
const header=v=>String(v||'').trim().replace(/^<|>$/g,'');
const addr=v=>String(v||'').trim().toLowerCase();
const addresses=v=>(v||[]).map(x=>addr(x.address)).filter(Boolean);
const stamp=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null};
export function anchorIds(messages,intakes,forwards=[]){return [...new Set([...messages,...intakes,...forwards.map(x=>({message_id:x.provider_message_id}))].map(x=>header(x.message_id)).filter(x=>x&&x.length<=500&&!/[\r\n]/.test(x)))].slice(0,100)}
export function linkedToAnchor(message,anchors){return [message.messageId,message.inReplyTo,...(Array.isArray(message.references)?message.references:message.references?[message.references]:[])].some(x=>anchors.includes(header(x)))}
export function historyFolders(boxes){
 const inbox=boxes.find(b=>b.specialUse==='\\Inbox')||boxes.find(b=>b.path==='INBOX');
 const sent=boxes.find(b=>b.specialUse==='\\Sent')||boxes.find(b=>/sent|已发送/i.test(b.path)&&!/outbox|draft|发件箱|草稿/i.test(b.path));
 return [inbox&&{path:inbox.path,direction:'inbound'},sent&&{path:sent.path,direction:'outbound'}].filter(Boolean);
}
export function safeBody(parsed,sourceBytes){
 const text=String(parsed.text||String(parsed.html||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?\s*>|<\/p>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
 const truncated=text.length>65536||sourceBytes>=2_000_000;
 return {body_text:text.slice(0,65536),body_truncated:truncated,body_status:truncated?'truncated':'complete'};
}
export function textBodyPart(structure){
 const parts=[];let visited=0;
 const visit=node=>{if(!node||visited++>100)return;if(String(node.disposition||'').toLowerCase()==='attachment'||node.parameters?.name||node.dispositionParameters?.filename)return;const type=String(node.type||'').toLowerCase();if(type==='text/plain'||type==='text/html')parts.push({...node,type,part:node.part||'1'});for(const child of node.childNodes||[])visit(child)};
 visit(structure);return parts.find(p=>p.type==='text/plain')||parts.find(p=>p.type==='text/html')||null;
}
export async function readTextBody(client,uid,structure){
 const part=textBodyPart(structure);if(!part)return {body_text:'',body_truncated:false,body_status:'unavailable'};
 const result=await client.download(uid,part.part,{uid:true,maxBytes:262144});
 if(!result?.content)return {body_text:'',body_truncated:false,body_status:'unavailable'};
 const chunks=[];let bytes=0;for await(const chunk of result.content){const b=Buffer.from(chunk);bytes+=b.length;chunks.push(b)}
 const text=Buffer.concat(chunks).toString('utf8'),body=safeBody(part.type==='text/html'?{html:text}:{text},bytes);
 if(bytes>=262144||body.body_truncated)return {...body,body_truncated:true,body_status:'truncated'};
 return body;
}
export async function boundedRead(operation,timeoutMs,onTimeout=()=>{}){
 let timer;
 try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>{try{onTimeout()}catch{}reject(Error('history_io_timeout'))},Math.max(1,timeoutMs))})])}finally{clearTimeout(timer)}
}
async function checked(query){const bounded=typeof query.abortSignal==='function'?query.abortSignal(AbortSignal.timeout(10000)):query;const result=await bounded;if(result.error)throw Error('read_failed');return result.data}
export async function processHistoryChunk({admin,userClient,actorId,requestId,ImapFlow,simpleParser,now=()=>Date.now(),ioTimeoutMs=8000}){
 const claim=await checked(admin.rpc('claim_inquiry_mail_history',{actor_id:actorId,request_key:requestId}));
 if(!claim?.job)return {done:!!claim?.done,jobs:claim?.jobs||[]};
 const job=claim.job,cursor={...job.cursor},counts={searched:0,matched:0,stored:0,skipped:0,bodies_incomplete:0,...job.counts};
 const finish=async(status,code=null)=>{if(!code)cursor.read_failures=0;await checked(admin.rpc('finish_inquiry_mail_history',{job_key:job.id,lease_key:job.lease_token,new_status:status,new_cursor:cursor,new_counts:counts,failure_code:code}));return {done:false,progress:{status,counts,error_code:code}}};
 let client;let phase='scope';const chunkDeadline=now()+35000;
 const read=(operation,step)=>{phase=step;const remaining=chunkDeadline-now();if(remaining<=0)throw Error('history_io_timeout');return boundedRead(operation,Math.min(ioTimeoutMs,remaining),()=>client?.close?.())};
 try{
  const inquiry=await checked(userClient.from('inquiries').select('id,owner_id').eq('id',claim.inquiry_id).single());
  if(inquiry?.owner_id!==claim.owner_id)return await finish('cancelled','scope_changed');
  phase='mailbox';
  const connection=await checked(admin.from('mailbox_connections').select('id,user_id,email,mailbox_kind,status,sync_enabled,imap_host,imap_port').eq('id',job.connection_id).eq('user_id',claim.owner_id).eq('mailbox_kind','personal').eq('status','connected').single());
  if(!connection?.sync_enabled||!['imap.qiye.aliyun.com','imap.mxhichina.com','imap.aliyun.com','imap.exmail.qq.com','outlook.office365.com','imap.gmail.com'].includes(String(connection.imap_host).toLowerCase())||Number(connection.imap_port)!==993)return await finish('failed','mailbox_unavailable');
  phase='anchors';
  const [messages,intakes,forwards]=await Promise.all([
   checked(admin.from('email_messages').select('message_id').eq('inquiry_id',claim.inquiry_id).eq('association_status','matched').order('created_at',{ascending:true}).limit(100)),
   checked(admin.from('email_intake').select('message_id').eq('inquiry_id',claim.inquiry_id).order('created_at',{ascending:true}).limit(100)),
   checked(admin.rpc('read_inquiry_mail_history_forward_ids',{job_key:job.id,lease_key:job.lease_token}))
  ]);
  const anchors=anchorIds(messages||[],intakes||[],forwards||[]);cursor.anchor_limit=(messages||[]).length+(intakes||[]).length+(forwards||[]).length>=100;if(!anchors.length)return await finish('partial','no_thread_anchor');
  phase='credential';
  const password=await checked(admin.rpc('read_mailbox_secret',{target_connection_id:connection.id}));if(!password)return await finish('failed','mailbox_unavailable');
  client=new ImapFlow({host:connection.imap_host,port:connection.imap_port,secure:true,auth:{user:connection.email,pass:password},logger:false,connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000});
  client.on?.('error',()=>{});
  await read(()=>client.connect(),'connect');
  cursor.folders ||= historyFolders(await read(()=>client.list(),'folders'));cursor.folderIndex ||=0;cursor.anchorIndex ||=0;cursor.uidIndex ||=0;cursor.uids ||= [];
  if(!cursor.folders.length)return await finish('failed','mailbox_unavailable');
  if(cursor.folderIndex>=cursor.folders.length)return await finish('completed');
  const folder=cursor.folders[cursor.folderIndex],lock=await read(()=>client.getMailboxLock(folder.path,{readOnly:true}),'open'),deadline=now()+15000;
  let terminal=false;
  try{
   const validity=String(client.mailbox.uidValidity||'');
   if(cursor.validity&&cursor.validity!==validity){cursor.anchorIndex=0;cursor.uidIndex=0;cursor.uids=[]}cursor.validity=validity;
   let searches=0;
   while(cursor.anchorIndex<anchors.length&&searches<4&&now()<deadline){
    const id=anchors[cursor.anchorIndex];
    const found=await read(()=>client.search({since:new Date(claim.window_from),before:new Date(new Date(claim.window_to).getTime()+86400000),or:[{header:{'message-id':id}},{header:{'in-reply-to':id}},{header:{references:id}}]},{uid:true}),'search');
    cursor.uids=[...new Set([...cursor.uids,...(Array.isArray(found)?found:[])])].sort((a,b)=>a-b);cursor.anchorIndex++;searches++;counts.searched++;
    if(cursor.uids.length>10000){terminal=true;break}
   }
   if(terminal)return await finish('partial','scan_limit');
   if(cursor.anchorIndex<anchors.length)return await finish('queued');
   let processed=0;
   while(cursor.uidIndex<cursor.uids.length&&processed<5&&now()<deadline){
    const uid=cursor.uids[cursor.uidIndex];
    const metadata=await read(()=>client.fetchOne(uid,{uid:true,envelope:true,internalDate:true,size:true,bodyStructure:true,headers:['Message-ID','In-Reply-To','References']},{uid:true}),'headers');
    if(!metadata){cursor.uidIndex++;counts.skipped++;continue}
    const parsedHeaders=await simpleParser(metadata.headers||Buffer.from(''));
    const headers={messageId:parsedHeaders.messageId||metadata.envelope?.messageId,inReplyTo:parsedHeaders.inReplyTo||metadata.envelope?.inReplyTo,references:parsedHeaders.references||[]};
    const time=stamp(metadata.internalDate||metadata.envelope?.date);
    if(!time||Date.parse(time)<Date.parse(claim.window_from)||Date.parse(time)>Date.parse(claim.window_to)||!linkedToAnchor(headers,anchors)){cursor.uidIndex++;counts.skipped++;continue}
    const fresh=await checked(userClient.from('inquiries').select('id,owner_id').eq('id',claim.inquiry_id).single());
    if(fresh?.owner_id!==claim.owner_id)return await finish('cancelled','scope_changed');
    let body={body_text:'',body_truncated:false,body_status:'unavailable'};
    try{body=await read(()=>readTextBody(client,uid,metadata.bodyStructure),'body')}catch{body={body_text:'',body_truncated:false,body_status:'unavailable'}}
    if(body.body_status!=='complete')counts.bodies_incomplete++;
    const record={inquiry_id:claim.inquiry_id,mailbox_connection_id:connection.id,mailbox_owner_id:claim.owner_id,folder:folder.path,uid_validity:validity,uid,message_id:header(headers.messageId)||null,in_reply_to:header(headers.inReplyTo)||null,reference_ids:(Array.isArray(headers.references)?headers.references:headers.references?[headers.references]:[]).map(header).slice(0,100),direction:folder.direction,sender_email:addr(metadata.envelope?.from?.[0]?.address),recipient_emails:addresses(metadata.envelope?.to),subject:String(metadata.envelope?.subject||'').slice(0,2000),event_at:time,sent_at:folder.direction==='outbound'?time:null,received_at:folder.direction==='inbound'?time:null,run_id:job.request_id,...body};
    const beforeWrite=await checked(userClient.from('inquiries').select('id,owner_id').eq('id',claim.inquiry_id).single());
    if(beforeWrite?.owner_id!==claim.owner_id)return await finish('cancelled','scope_changed');
    const inserted=await checked(admin.rpc('append_inquiry_mail_history',{job_key:job.id,lease_key:job.lease_token,message_data:record}));
    counts.matched++;counts.stored+=inserted?1:0;cursor.uidIndex++;processed++;
   }
   if(cursor.uidIndex>=cursor.uids.length){cursor.folderIndex++;cursor.anchorIndex=0;cursor.uidIndex=0;cursor.uids=[];delete cursor.validity;}
   return await finish(cursor.folderIndex>=cursor.folders.length?(cursor.anchor_limit||counts.bodies_incomplete?'partial':'completed'):'queued',cursor.folderIndex>=cursor.folders.length?(cursor.anchor_limit?'scan_limit':counts.bodies_incomplete?'read_failed':null):null);
  }finally{lock.release()}
 }catch(error){
  cursor.read_failures=Number(cursor.read_failures||0)+1;
  const code=error?.message==='history_io_timeout'?'timeout':['AUTHENTICATIONFAILED','EAUTH','ETIMEDOUT','ECONNRESET','ECONNREFUSED'].includes(error?.code)?error.code:'read_failed';
  console.warn('inquiry_mail_history_read_failed',JSON.stringify({phase,code}));
  return await finish(cursor.read_failures>=3?'failed':'queued','read_failed');
 }finally{if(client){await boundedRead(()=>client.logout(),2000,()=>client.close?.()).catch(()=>{});try{client.close?.()}catch{}}}
}
