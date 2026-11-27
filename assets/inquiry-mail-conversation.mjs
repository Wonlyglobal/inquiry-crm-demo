import {splitMailText,detectMailSignals,paintMailSignals} from './mail-pipeline-signals.mjs?v=20261127-1';
const time=m=>m.received_at||m.sent_at||m.event_at||'';
const header=v=>String(v||'').trim().replace(/^<|>$/g,'');
export function mergeConversation(live=[],history=[]){
 const map=new Map();
 for(const m of [...history,...live]){
  const key=header(m.message_id)||String(m.id),previous=map.get(key);
  const quality=x=>(x.body_text?10:0)+(!x.body_truncated?2:0)+(!x.historical?4:0)+(x.direction==='outbound'?1:0);
  if(!previous||quality(m)>quality(previous))map.set(key,{...m,recordKey:key});
 }
 return [...map.values()].sort((a,b)=>Date.parse(time(a)||0)-Date.parse(time(b)||0)||a.recordKey.localeCompare(b.recordKey));
}
export function bodyParts(value=''){
 return splitMailText(value);
}
export function paintConversation(host,messages,{formatDate=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}={}){
 host.replaceChildren();
 if(!messages.length){const p=document.createElement('p');p.textContent='暂未读取到已关联邮件。历史回补未完成或邮箱未连接时，不能据此判断没有沟通。';host.append(p);return}
 for(const m of messages){
  const row=document.createElement('article');row.className='inquiry-conversation-message '+(m.direction==='outbound'?'outbound':'inbound');row.setAttribute('data-conversation-record',String(m.id));
  const h=document.createElement('header'),who=document.createElement('b'),date=document.createElement('time');
  who.textContent=m.direction==='outbound'?'我方发件（以发件人地址为准）':/@(?:[^@.]+\.)*wonlyglobal\.com$/i.test(m.sender_email||'')?'内部转发 / 往来':'客户来信（已关联）';
  date.textContent=time(m)?formatDate(time(m))+'（北京时间）':'时间未提供';h.append(who,date);
  const people=document.createElement('small');people.textContent='发件人：'+(m.sender_email||'未提供')+' → 收件人：'+((m.recipient_emails||[]).join('、')||'未提供');
  const title=document.createElement('strong');title.textContent=m.subject||'无主题';
  const source=document.createElement('small');source.textContent=m.historical?'最近90天历史回补 · 不生成旧信待办':'现有邮箱同步记录';
  const parts=bodyParts(m.body_text),body=document.createElement('p');body.textContent=(parts.text.length>1200?parts.text.slice(0,1200)+'…（预览，展开原文查看完整内容）':parts.text)||(!m.body_text?'正文未取得，请在原邮箱核对':'本封正文仅包含引用内容，请展开原文核对');
  const original=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='展开邮件原文（含引用及签名）';pre.textContent=m.body_text||'正文未取得';original.append(summary,pre);
  row.append(h,people,title,source,body,original);
  if(m.body_truncated||m.body_status==='unavailable'){const warning=document.createElement('p');warning.textContent=m.body_status==='unavailable'?'本封仅取得邮件头，正文尚未取得。':'正文受容量限制，仅展示部分内容，请核对原邮箱。';row.append(warning)}
  host.append(row);
 }
}
export function mountInquiryConversation(host,{client,role,isCurrent=()=>true,getContext=()=>({}),onReviewSignal=()=>{}}={}){
 let inquiryId=null,offset=0,live=[],history=[],liveMore=true,historyMore=true,sequence=0,busy=false;
 host.innerHTML='<div class="inquiry-conversation-tools"><h4>邮件沟通记录</h4><button type="button" class="ghost" data-conversation-refresh>重新核对</button></div><p>按实际收发时间排列。每封邮件是一条记录，引用内容保留在原文中；不自动发送或回复。</p><p data-conversation-status role="status"></p><section data-mail-signals aria-label="邮件识别与流水线核对"></section><div data-conversation-messages></div><button type="button" class="ghost" data-conversation-more>加载更早记录</button>';
 const $=s=>host.querySelector(s);
 async function load(reset=false){
  if(busy||!inquiryId)return;busy=true;$('[data-conversation-refresh]').disabled=true;$('[data-conversation-more]').disabled=true;const seq=++sequence,id=inquiryId;
  if(reset){offset=0;live=[];history=[];liveMore=historyMore=true;$('[data-conversation-messages]').replaceChildren();$('[data-mail-signals]').replaceChildren()}
  $('[data-conversation-status]').textContent='正在读取已授权邮件记录…';
  try{
   if(!['owner','sales_manager','sales'].includes(role))throw Error('邮件沟通内容仅负责人、主管及老板可查看');
   const results=await Promise.allSettled([
    liveMore?client.from('email_messages').select('id,inquiry_id,message_id,direction,sender_email,recipient_emails,subject,body_text,sent_at,received_at,created_at,association_method,association_status,folder,attachment_count').eq('inquiry_id',id).eq('association_status','matched').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+24):Promise.resolve({data:[]}),
    historyMore?client.rpc('get_inquiry_mail_history',{target_ids:[id],include_body:true,page_offset:offset}):Promise.resolve({data:{items:[],has_more:false}})
   ]);
   if(seq!==sequence||!isCurrent(id))return;
   let errors=0;
   for(let n=0;n<results.length;n++){const r=results[n];if(r.status==='rejected'||r.value.error){errors++;continue}if(n===0){live.push(...(r.value.data||[]));liveMore=(r.value.data||[]).length===25}else{history.push(...(r.value.data?.items||[]));historyMore=!!r.value.data?.has_more}}
   const records=mergeConversation(live,history);paintConversation($('[data-conversation-messages]'),records);
   const base=getContext();let signalContext={...base,role,available:false};
   try{
    if(base.inquiry?.id===id){
     const [fresh,owner,boxes]=await Promise.all([
      client.from('inquiries').select('id,owner_id,assigned_at,status,validity,invalid_review_status,updated_at').eq('id',id).single(),
      client.from('profiles').select('id,email').eq('id',base.inquiry.owner_id).single(),
      client.from('mailbox_connections').select('user_id,email').eq('user_id',base.inquiry.owner_id).eq('mailbox_kind','personal')
     ]);
     if(fresh.error||owner.error||boxes.error||fresh.data?.owner_id!==base.inquiry.owner_id||fresh.data?.status!==base.inquiry.status||fresh.data?.updated_at!==base.inquiry.updated_at)throw Error('signal_context_changed');
     signalContext={...base,role,inquiry:fresh.data,available:true,ownEmails:[owner.data?.email,...(boxes.data||[]).map(box=>box.email)].filter(Boolean)};
    }
   }catch{signalContext.available=false}
   if(seq!==sequence||!isCurrent(id))return;
   const signals=detectMailSignals(records,signalContext);
   paintMailSignals($('[data-mail-signals]'),signals,{partial:!!errors||!signalContext.available,loadedCount:records.length,onReview:signal=>onReviewSignal(signal,signalContext),onOpenMessage:messageId=>{
    if(!isCurrent(id))return;
    const row=[...host.querySelectorAll('[data-conversation-record]')].find(item=>item.getAttribute('data-conversation-record')===String(messageId));
    if(row){row.querySelector('details').open=true;row.scrollIntoView({block:'center',behavior:'smooth'})}
   }});
   $('[data-conversation-status]').textContent=errors?'部分记录读取失败。已保留成功读取的邮件，请重新核对；不能视为完整记录。':`已加载 ${records.length} 封已关联邮件${liveMore||historyMore?'，更早记录请继续加载':'。历史回补仍在进行时，之后可能出现更多记录。'}`;
   if(!errors)offset+=25;
   $('[data-conversation-more]').hidden=!liveMore&&!historyMore;
  }catch(error){if(seq===sequence&&isCurrent(id))$('[data-conversation-status]').textContent=error.message}
  finally{if(seq===sequence){busy=false;$('[data-conversation-refresh]').disabled=false;$('[data-conversation-more]').disabled=false;}}
 }
 $('[data-conversation-refresh]').onclick=()=>load(true);$('[data-conversation-more]').onclick=()=>load();
 return {open(id){if(id!==inquiryId){inquiryId=id;sequence++;busy=false;}return load(true)},clear(){sequence++;inquiryId=null;busy=false;live=[];history=[];$('[data-conversation-messages]').replaceChildren();$('[data-mail-signals]').replaceChildren()}};
}
export function historyBackfillQueue({client,role,actorId,onUpdate=()=>{}}){
 const states=new Map(),entries=new Map(),pending=[];let running=0;
 async function pump(){
  if(running>=2||!pending.length||document.visibilityState==='hidden')return;
  const item=pending.shift();item.queued=false;item.running=true;running++;
  try{
   if(!item.requestId){
    const started=await client.functions.invoke('inquiry-mail-history',{body:{action:'start',inquiry_id:item.inquiry.id,request_id:crypto.randomUUID(),days:90}});
    if(started.error||!started.data?.request_id)throw Error('not_started');
    item.requestId=started.data.request_id;
   }
   const result=await client.functions.invoke('inquiry-mail-history',{body:{action:'continue',request_id:item.requestId}});
   if(result.error)throw Error('not_confirmed');
   if(entries.get(item.inquiry.id)!==item)return;
   const incomplete=(result.data?.jobs||[]).some(j=>['partial','failed','cancelled'].includes(j.status))||['partial','failed','cancelled'].includes(result.data?.progress?.status);
   item.done=!!result.data?.done;
   states.set(item.inquiry.id,incomplete?'90天历史回补不完整，请核对邮箱连接及原邮件线程':item.done?'90天历史检索任务已结束，仅已匹配邮件纳入记录':'90天历史正在后台分批回补，完成后自动读取');
  }catch{if(entries.get(item.inquiry.id)===item)states.set(item.inquiry.id,'90天历史回补暂未确认，请核对邮箱连接或稍后刷新')}
  finally{running--;item.running=false;onUpdate();void pump();}
 }
 function enqueue(item){if(!item.done&&!item.running&&!item.queued){item.queued=true;pending.push(item)}}
 return {states,add(inquiries){
  if(!['owner','sales_manager','sales'].includes(role))return;
  for(const i of inquiries)if(i.owner_id&&(role!=='sales'||i.owner_id===actorId)){
   let item=entries.get(i.id);
   if(!item||item.inquiry.owner_id!==i.owner_id){item={inquiry:i,done:false,queued:false,running:false};entries.set(i.id,item);states.set(i.id,'90天历史待核对');enqueue(item)}
  }
  void pump();void pump();
 },resume(){for(const item of entries.values())enqueue(item);void pump();void pump();}};
}
