// Observational, metadata only. Existing client RLS remains the access boundary.
const instant=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null};
const addr=v=>String(v||'').trim().toLowerCase();
const header=v=>String(v||'').trim().replace(/^<|>$/g,'');
const allowed=role=>['owner','sales_manager','sales'].includes(role);
export function summarizeInquiryMail(inquiry,{messages=[],connections=[],people=[],error=false,partial=false,asOf=new Date().toISOString()}={}){
 const base={inquiryId:inquiry.id,asOf,lastIncoming:null,lastSent:null,lastReply:null,syncAt:null,partial};
 if(!inquiry.owner_id)return {...base,code:'unassigned',label:'尚未分配业务员'};
 if(error)return {...base,code:'unavailable',label:'邮件状态读取失败，请刷新核对'};
 const boxes=connections.filter(c=>c.user_id===inquiry.owner_id&&c.mailbox_kind==='personal');
 const emails=new Set([...boxes.map(c=>addr(c.email)),...people.filter(p=>p.id===inquiry.owner_id).map(p=>addr(p.email))].filter(Boolean));
 const internal=new Set([...connections.map(c=>addr(c.email)),...people.map(p=>addr(p.email))].filter(Boolean));
 const external=e=>e&&!internal.has(e)&&!/@(?:[^@.]+\.)*wonlyglobal\.com$/i.test(e);
 const cutoff=instant(asOf)??Date.now();
 const rows=messages.filter(m=>m.inquiry_id===inquiry.id&&m.association_status==='matched');
 const received=rows.filter(m=>m.direction==='inbound'&&external(addr(m.sender_email))&&instant(m.received_at)!==null&&instant(m.received_at)<=cutoff);
 const logicalIncoming=new Map();
 for(const m of received){const key=header(m.message_id)||m.id,old=logicalIncoming.get(key);if(!old||instant(m.received_at)<instant(old.received_at))logicalIncoming.set(key,m)}
 const incoming=[...logicalIncoming.values()];
 const byHeader=new Map(incoming.filter(m=>header(m.message_id)).map(m=>[header(m.message_id),m]));
 const assigned=instant(inquiry.assigned_at);
 const outbound=rows.filter(m=>m.direction==='outbound'&&!/draft|草稿|outbox|发件箱/i.test(m.folder||'')&&(emails.has(addr(m.sender_email))||m.historical&&m.mailbox_owner_id===inquiry.owner_id)&&instant(m.sent_at)!==null&&instant(m.sent_at)<=cutoff&&(assigned===null||instant(m.sent_at)>=assigned));
 const replies=outbound.filter(m=>{
  if(/^\s*(?:fw|fwd|转发|转寄)\s*[:：]/i.test(m.subject||''))return false;
  return [m.in_reply_to,...(Array.isArray(m.reference_ids)?m.reference_ids:[])].some(h=>{
   const parent=byHeader.get(header(h));return parent&&(m.recipient_emails||[]).some(to=>addr(to)===addr(parent.sender_email));
  });
 });
 const newest=(items,key)=>items.reduce((v,m)=>!v||instant(m[key])>instant(v)?m[key]:v,null);
 base.lastIncoming=newest(incoming,'received_at');base.lastSent=newest(outbound,'sent_at');base.lastReply=newest(replies,'sent_at');
 const active=boxes.filter(c=>c.status!=='disabled'&&c.sync_enabled!==false);
 const syncing=active.some(c=>c.status!=='connected'||c.error_message||!c.last_synced_at);
 // Freshness for all connected owner mailboxes is limited by the oldest cursor.
 base.syncAt=active.length&&active.every(c=>instant(c.last_synced_at)!==null)?active.map(c=>c.last_synced_at).sort((a,b)=>instant(a)-instant(b))[0]:null;
 base.syncNote=syncing?'邮箱未连接、未同步或同步异常':base.syncAt?'仅已同步记录；接入前历史可能缺失':'同步覆盖暂不可核对';
 if(partial)return {...base,code:'partial',label:'记录未完整读取，暂不判断回复状态'};
 const newestIncoming=incoming.find(m=>m.received_at===base.lastIncoming);
 const newestAnswered=newestIncoming&&replies.some(m=>[m.in_reply_to,...(m.reference_ids||[])].some(h=>header(h)===header(newestIncoming.message_id))&&(m.recipient_emails||[]).some(to=>addr(to)===addr(newestIncoming.sender_email)));
 if(newestAnswered&&instant(base.lastIncoming)>instant(base.lastReply))return {...base,code:'time_conflict',label:'已检出回复线程，但邮件时序存在冲突，请核对原邮箱'};
 if(base.lastIncoming&&(!base.lastSent||instant(base.lastIncoming)>instant(base.lastSent)))return {...base,code:'incoming',label:base.lastReply?'客户再次来信，暂未检出后续回复':'已检出客户来信，暂未检出业务员回复'};
 if(base.lastReply&&instant(base.lastReply)>=instant(base.lastIncoming))return {...base,code:'replied',label:'已检出业务员回复，暂未检出客户新回信'};
 if(base.lastSent)return {...base,code:'sent_unverified',label:'已检出业务员发件，回复线程待核对'};
 return {...base,code:'no_evidence',label:'暂未检出已关联邮件，不能判断是否回复'};
}
export function mailReplyText(s,{formatDate=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}={}){
 return [s.label,s.lastReply?'最近业务员回复：'+formatDate(s.lastReply):s.lastSent?'最近业务员发件：'+formatDate(s.lastSent):'',s.lastIncoming?'最近客户来信：'+formatDate(s.lastIncoming):'',s.syncAt?'同步至 '+formatDate(s.syncAt):'',s.syncNote||''].filter(Boolean).join('\n');
}
export async function loadInquiryMailReplies(client,inquiries,{role,actorId,pageSize=500,maxPages=20}={}){
 let permitted=allowed(role)?inquiries.filter(i=>role!=='sales'||i.owner_id===actorId):[];
 const results=new Map(inquiries.map(i=>[i.id,{inquiryId:i.id,code:'restricted',label:'邮件回复情况仅负责人、主管及老板可查看'}]));
 if(!permitted.length)return results;
 const ids=[...new Set(permitted.map(i=>i.id))],ownerIds=[...new Set(permitted.map(i=>i.owner_id).filter(Boolean))];
 try{
  const fresh=new Map();
  for(let start=0;start<ids.length;start+=200){
   const result=await client.from('inquiries').select('id,owner_id,assigned_at').in('id',ids.slice(start,start+200));
   if(result.error)throw Error('inquiry_read_failed');
   for(const row of result.data||[])fresh.set(row.id,row);
  }
  permitted=permitted.filter(inquiry=>{
   const row=fresh.get(inquiry.id);
   if(!row)return false;
   if(row.owner_id!==inquiry.owner_id||instant(row.assigned_at)!==instant(inquiry.assigned_at)){
    results.set(inquiry.id,{inquiryId:inquiry.id,code:'owner_changed',label:'负责人或分配时间已变化，请刷新询盘后核对'});return false;
   }
   return true;
  });
  if(!permitted.length)return results;
  const activeIds=permitted.map(i=>i.id);
  const connections=[],people=[],messages=[];let partial=false;
  for(let start=0;start<ownerIds.length;start+=200){
   const owners=ownerIds.slice(start,start+200);
   const both=await Promise.allSettled([
    client.from('mailbox_connections').select('id,user_id,email,mailbox_kind,status,sync_enabled,last_synced_at,error_message').eq('mailbox_kind','personal').in('user_id',owners),
    client.from('profiles').select('id,email').in('id',owners)
   ]);
   for(let n=0;n<both.length;n++){const r=both[n];if(r.status==='fulfilled'&&!r.value.error)(n?people:connections).push(...(r.value.data||[]));else partial=true;}
  }
  for(let start=0;start<activeIds.length;start+=200){
   for(let page=0;page<maxPages;page++){
    const result=await client.from('email_messages').select('id,inquiry_id,mailbox_connection_id,message_id,in_reply_to,reference_ids,direction,sender_email,recipient_emails,subject,folder,sent_at,received_at,association_status').in('inquiry_id',activeIds.slice(start,start+200)).eq('association_status','matched').order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*pageSize,(page+1)*pageSize-1);
    if(result.error)throw Error('metadata_read_failed');messages.push(...(result.data||[]));
    if((result.data||[]).length<pageSize)break;
    if(page===maxPages-1)partial=true;
   }
  }
  // Historical evidence uses a separate table so it cannot create live-mail
  // notifications or change SLA/followup/quotation state.
  for(let start=0;start<activeIds.length;start+=100){
   for(let page=0;page<maxPages;page++){
    const result=await client.rpc('get_inquiry_mail_history',{target_ids:activeIds.slice(start,start+100),include_body:false,page_offset:page*500});
    if(result.error){partial=true;break}
    messages.push(...(result.data?.items||[]));
    if(!result.data?.has_more)break;if(page===maxPages-1)partial=true;
   }
  }
  for(const inquiry of permitted)results.set(inquiry.id,summarizeInquiryMail(inquiry,{messages,connections,people,partial}));
 }catch{for(const inquiry of permitted)results.set(inquiry.id,summarizeInquiryMail(inquiry,{error:true}));}
 return results;
}
