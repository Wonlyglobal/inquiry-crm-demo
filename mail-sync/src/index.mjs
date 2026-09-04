import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';
import { parseWebsiteFormMessage, websiteInquiryTitle } from './website-form.mjs';

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const interval=Math.max(30,Number(process.env.SYNC_INTERVAL_SECONDS||60))*1000;
const initialLimit=Math.max(10,Number(process.env.INITIAL_SYNC_LIMIT||100));
const reportHour=Math.min(23,Math.max(0,Number(process.env.DAILY_LEAD_REPORT_HOUR||18)));
const feishuWebhook=String(process.env.FEISHU_WEBHOOK_URL||'').trim();
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const cleanEmail=(v)=>String(v||'').trim().toLowerCase();
const normalizeSubject=(v)=>String(v||'').replace(/^\s*((re|fw|fwd|答复|回复|转发)\s*[:：]\s*)+/i,'').replace(/\s+/g,' ').trim().toLowerCase();
const addrList=(node)=>[...(node?.value||[])].map(x=>cleanEmail(x.address)).filter(Boolean);
const headerId=(v)=>String(v||'').trim().replace(/^<|>$/g,'');
const isSentFolder=(name)=>/sent|已发送|发件箱/i.test(name);
const isInstantlyNurturing=(message,connection)=>{
  if(connection.mailbox_kind!=='shared_inquiry'||message.direction!=='inbound')return false;
  const content=[message.sender_email,message.subject,message.body_text].filter(Boolean).join('\n');
  // Instantly warm-up traffic currently carries either the Chloe identity or
  // the campaign marker used by the warm-up pool. Keep it in the mail archive,
  // but never create CRM inquiries, tasks, notifications, or dashboard data.
  return /\bchloe\b/i.test(content)||/\b50JPRYT\b/i.test(content);
};
const sourceNames={email:'企业邮箱',manual:'手工录入（待补充渠道）',website:'官网表单',feishu:'飞书',google_ads:'Google Ads',meta_ads:'Meta Ads',linkedin:'LinkedIn',exhibition:'展会',outbound:'销售自主开发',referral:'经销商/客户转介绍',other:'其他'};
const statusNames={pending_assignment:'待分配',received:'收到询盘',qualified:'有效询盘',contacted:'已联系',quoted:'已报价',sample_sent:'已寄样',negotiating:'谈判',won:'成交',lost:'丢单'};
const validityNames={pending:'待确认',valid:'有效',invalid:'无效'};
function chinaParts(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=type=>parts.find(x=>x.type===type)?.value||'';
  return {date:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};
}

async function sendDailyLeadReport(){
  if(!feishuWebhook)return;
  const now=chinaParts();
  if(now.hour<reportHour)return;
  const start=`${now.date}T00:00:00+08:00`,endDate=new Date(start);endDate.setDate(endDate.getDate()+1);const end=endDate.toISOString();
  const {data:sent,error:sentError}=await db.from('audit_logs').select('id').eq('action','daily_lead_feishu_report').gte('created_at',start).lt('created_at',end).limit(1);
  if(sentError)throw sentError;if(sent?.length)return;
  const [{data:profiles,error:profileError},{data:inquiries,error:inquiryError}]=await Promise.all([
    db.from('profiles').select('id,full_name,role').eq('role','sales').eq('active',true),
    db.from('inquiries').select('id,inquiry_no,created_by,source,target_country,product_category,validity,status,created_at').eq('excluded_from_dashboard',false).gte('created_at',start).lt('created_at',end).order('created_at',{ascending:true}),
  ]);
  if(profileError)throw profileError;if(inquiryError)throw inquiryError;
  const people=new Map((profiles||[]).map(x=>[x.id,x.full_name||'未命名业务员']));
  const rows=(inquiries||[]).filter(x=>people.has(x.created_by));
  const bySales=new Map(),bySource=new Map();
  rows.forEach(row=>{const seller=people.get(row.created_by);bySales.set(seller,(bySales.get(seller)||0)+1);const source=sourceNames[row.source]||row.source||'待补充';bySource.set(source,(bySource.get(source)||0)+1);});
  const lines=[`【每日新增客户线索日报】${now.date}`,`今日新增：${rows.length} 条`];
  if(rows.length){
    lines.push(`业务员汇总：${[...bySales].sort((a,b)=>b[1]-a[1]).map(([name,count])=>`${name} ${count}条`).join('；')}`);
    lines.push(`渠道汇总：${[...bySource].sort((a,b)=>b[1]-a[1]).map(([name,count])=>`${name} ${count}条`).join('；')}`,'','线索明细：');
    rows.slice(0,60).forEach((row,index)=>{const no=String(row.inquiry_no||'').padStart(6,'0');lines.push(`${index+1}. #${no} | ${people.get(row.created_by)} | ${sourceNames[row.source]||row.source||'待补充'}`,`国家/地区：${row.target_country||'待补充'} | 产品：${row.product_category||'待补充'}`,`有效性：${validityNames[row.validity]||row.validity||'待确认'} | 阶段：${statusNames[row.status]||row.status||'待补充'}`,`CRM：http://crm.foreverdoodle.com/#inquiry/${row.id}`);});
    if(rows.length>60)lines.push(`还有 ${rows.length-60} 条未展开，请进入 CRM 查看。`);
  }else lines.push('今日暂无业务员新增客户线索。');
  lines.push('','说明：本日报由 CRM 根据业务员本人新建的真实线索自动生成，不含客户公司名和邮箱。');
  const response=await fetch(feishuWebhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msg_type:'text',content:{text:lines.join('\n')}}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok||result.code!==0)throw new Error(`飞书日报发送失败：${result.msg||response.status}`);
  const {error:auditError}=await db.from('audit_logs').insert({actor_id:null,entity_type:'system',entity_id:null,action:'daily_lead_feishu_report',after_data:{report_date:now.date,lead_count:rows.length,sales_counts:Object.fromEntries(bySales),source_counts:Object.fromEntries(bySource)},reason:'每日新增客户线索自动发送到飞书群'});
  if(auditError)throw auditError;console.log(`daily lead report ${now.date}: ${rows.length} leads sent`);
}

async function secretFor(id){const {data,error}=await db.rpc('read_mailbox_secret',{target_connection_id:id});if(error||!data)throw error||new Error('邮箱凭据不存在');return data}

async function processOutbox(){
  const {data:jobs,error}=await db.from('mail_outbox').select('*').eq('status','pending').lte('next_attempt_at',new Date().toISOString()).order('created_at').limit(20);
  if(error)throw error;
  for(const job of jobs||[]){
    const claimedAt=new Date().toISOString();
    const {data:claimed}=await db.from('mail_outbox').update({status:'sending',started_at:claimedAt,attempts:Number(job.attempts||0)+1}).eq('id',job.id).eq('status','pending').select('*').maybeSingle();
    if(!claimed)continue;
    try{
      const [{data:connection,error:connectionError},{data:caller},{data:intake}]=await Promise.all([
        db.from('mailbox_connections').select('*').eq('user_id',job.sender_user_id).eq('status','connected').single(),
        db.from('profiles').select('full_name').eq('id',job.sender_user_id).single(),
        db.from('email_intake').select('message_id').eq('inquiry_id',job.inquiry_id).maybeSingle(),
      ]);
      if(connectionError||!connection)throw connectionError||new Error('业务员邮箱未连接');
      const password=await secretFor(connection.id);
      const transport=nodemailer.createTransport({host:connection.smtp_host,port:connection.smtp_port,secure:Number(connection.smtp_port)===465,auth:{user:connection.email,pass:password},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
      const threadId=headerId(intake?.message_id);
      const sent=await transport.sendMail({from:`"${caller?.full_name||connection.email}" <${connection.email}>`,to:job.recipient_email,subject:job.subject,text:job.body_text,...(threadId?{inReplyTo:threadId,references:[threadId]}:{})});
      const sentAt=new Date().toISOString();
      await db.from('mail_outbox').update({status:'sent',sent_at:sentAt,message_id:sent.messageId||null,last_error:null}).eq('id',job.id);
      if(job.draft_id)await db.from('outreach_drafts').update({status:'sent',sent_at:sentAt,message_id:sent.messageId||null,last_error:null,updated_at:sentAt}).eq('id',job.draft_id);
    }catch(error){
      const attempts=Number(claimed.attempts||1),terminal=attempts>=3;
      await db.from('mail_outbox').update({status:terminal?'failed':'pending',last_error:String(error?.message||error).slice(0,1000),next_attempt_at:new Date(Date.now()+Math.min(15,attempts*5)*60000).toISOString()}).eq('id',job.id);
      if(terminal&&job.draft_id)await db.from('outreach_drafts').update({status:'failed',last_error:String(error?.message||error).slice(0,1000),updated_at:new Date().toISOString()}).eq('id',job.draft_id);
    }
  }
}

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
  const websiteForm=parseWebsiteFormMessage(message);
  const customerEmail=websiteForm?.email||message.sender_email;
  const receivedAt=message.received_at||new Date().toISOString();
  if(!websiteForm){
    const {data:intake,error:intakeError}=await db.from('email_intake').insert({message_id:message.message_id||null,sender_email:customerEmail,sender_name:null,recipient_email:connection.email,subject:message.subject,body_text:message.body_text||'',received_at:receivedAt,parsed_data:{detected_source:'email'},processing_status:'pending_review',inquiry_id:null,created_by:creator,created_at:receivedAt}).select('id').single();
    if(intakeError)throw intakeError;
    const {data:markets}=await db.from('profiles').select('id').eq('role','marketing').eq('active',true);
    if(markets?.length)await db.from('notifications').insert(markets.map(p=>({recipient_id:p.id,inquiry_id:null,type:'new_inquiry_email',title:'收到待分拣邮件',body:`${customerEmail} · ${message.subject||'无主题'}`})));
    return {id:null,method:'shared_mailbox_pending_triage',intakeId:intake.id};
  }
  const domain=websiteForm.companyDomain||null;
  const companyName=websiteForm?.companyName||domain||customerEmail;
  let companyId=null,contactId=null;
  if(domain){const {data:c}=await db.from('companies').select('id').ilike('domain',domain).maybeSingle();companyId=c?.id||null}
  if(!companyId&&websiteForm?.companyName){const {data:c}=await db.from('companies').select('id').ilike('name',websiteForm.companyName).limit(1);companyId=c?.[0]?.id||null}
  if(!companyId){const {data:c}=await db.from('companies').insert({name:companyName,domain,country:websiteForm?.country||null,created_by:creator}).select('id').single();companyId=c?.id||null}
  else if(websiteForm?.country)await db.from('companies').update({country:websiteForm.country,updated_at:new Date().toISOString()}).eq('id',companyId).is('country',null);
  const {data:existing}=await db.from('contacts').select('id').eq('email',customerEmail).maybeSingle();contactId=existing?.id||null;
  if(!contactId){const {data:c}=await db.from('contacts').insert({company_id:companyId,full_name:websiteForm?.name||null,email:customerEmail,phone:websiteForm?.phone||null,job_title:websiteForm?.jobTitle||null,created_by:creator}).select('id').single();contactId=c?.id||null}
  const title=websiteForm?websiteInquiryTitle(websiteForm):(message.subject||`来自 ${message.sender_email} 的邮件询盘`);
  const inquiryPayload={company_id:companyId,contact_id:contactId,title,product_category:websiteForm?.product||null,quantity:websiteForm?.quantity||null,target_country:websiteForm?.country||null,source:websiteForm?'website':'email',source_detail:websiteForm?.sourceDetail||null,original_message:message.body_text||'',status:'pending_assignment',created_by:creator,updated_by:creator,created_at:receivedAt,first_contact_due_at:new Date(new Date(receivedAt).getTime()+10*60000).toISOString(),last_change_reason:websiteForm?'官网表单自动解析入库':'公共询盘邮箱自动收件'};
  const {data:inq,error}=await db.from('inquiries').insert(inquiryPayload).select('id').single();
  if(error)throw error;
  if(websiteForm?.journeyEvents?.length){
    const {error:journeyError}=await db.from('inquiry_user_journey_events').insert(websiteForm.journeyEvents.map(event=>({...event,inquiry_id:inq.id})));
    if(journeyError)console.error('Website journey persistence failed:',journeyError.message);
  }
  await db.from('email_intake').insert({message_id:message.message_id||null,sender_email:customerEmail,sender_name:websiteForm?.name||null,recipient_email:connection.email,subject:message.subject,body_text:message.body_text||'',received_at:receivedAt,parsed_data:websiteForm?{...websiteForm.rawFields,transport_sender:message.sender_email,detected_source:'website'}:{},processing_status:'pending_review',inquiry_id:inq.id,created_by:creator,created_at:receivedAt});
  const {data:markets}=await db.from('profiles').select('id').eq('role','marketing').eq('active',true);
  if(markets?.length)await db.from('notifications').insert(markets.map(p=>({recipient_id:p.id,inquiry_id:inq.id,type:'new_inquiry_email',title:websiteForm?'收到新的官网询盘':'收到新的邮件询盘',body:`${customerEmail} · ${title}`})));
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
        let match=nurturing?{id:null,method:'instantly_warmup_filter'}:await matchInquiry(record,connection);
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
  await processOutbox();
  await sendDailyLeadReport();
  const {data,error}=await db.from('mailbox_connections').select('*').eq('status','connected').eq('sync_enabled',true);if(error)throw error;
  await Promise.allSettled((data||[]).map(async connection=>{try{await syncMailbox(connection);console.log(`${connection.email} synced`)}catch(error){console.error(connection.email,error);await db.from('mailbox_connections').update({error_message:String(error?.message||error).slice(0,1000)}).eq('id',connection.id)}}));
  await writeFile('/tmp/healthy',new Date().toISOString());
}

while(true){try{await cycle()}catch(error){console.error(error)}await sleep(interval)}
