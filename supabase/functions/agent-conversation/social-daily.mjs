// Daily private snapshots through the existing exact-owner JWT RPC, never service-role impersonation.
import {loadSocialMetrics} from './social.mjs';
import {socialMetrics,stamp} from './source-metrics.mjs';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
async function hash(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(v))))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export function socialDailyMetadata(row){try{return JSON.parse(row?.document?.sections?.find(s=>s.title==='来源日期与覆盖')?.body||'{}')}catch{return {}}}
export async function socialDailyDocuments(source,previous=[],now=Date.now()){
 const snapshot=socialMetrics(source,null,now),date=new Date(now+8*3600000).toISOString().slice(0,10),generated=new Date(now).toISOString();
 const docs=[];
 for(const platform of ['tiktok','instagram','facebook','youtube']){
  const p=snapshot.platforms.find(p=>p.platform===platform),prior=previous.find(r=>r.document.kind===platform),old=socialDailyMetadata(prior);
  const success=p.status!=='unavailable'&&!!p.fetched_at;
  const metadata={platform,status:p.status,observed_at:generated,source_last_success_sync:success?p.fetched_at:stamp(old.source_last_success_sync,now),last_successful_knowledge_id:success?null:['available','partial'].includes(old.status)?prior?.id||null:old.last_successful_knowledge_id||null,source_date:p.fetched_at,window:p.window,post_count:p.posts.length,post_coverage_complete:p.complete,metric_gaps:p.metric_gaps,reason:p.reason,comparison:'仅与同窗口、同定义快照比较；累计值不是区间增量。失败不推进来源成功时间；空结果不证明平台没有发布。'};
  const rows=p.posts.map(row=>{const values=Object.entries(row.metrics).filter(([,v])=>v!==null).map(([k,v])=>`${k}=${v}`).join('；');const errors=Object.entries(row.metric_errors).map(([k,v])=>`${k}:${v}`).join('；');return `${row.url}\n发布：${row.published_at||'未知'}；${values||'指标全部未知'}${errors?'；缺口 '+errors:''}`});
  const chunks=[];let body='逐帖指标为本次获取的累计值，指标时间沿用来源日期。未列出的指标一律未知，不填0；公开视频不含正文、评论身份或画面理解。\n';let saved=0;
  for(const row of rows){if(body.length+row.length+2>2850){chunks.push(body.trim());body=''}if(chunks.length>=6)break;body+=row+'\n\n';saved++}
  if(body.trim())chunks.push(body.trim());metadata.saved_posts=saved;metadata.omitted_posts=rows.length-saved;if(metadata.omitted_posts){metadata.post_coverage_complete=false;metadata.reason='private_document_limit'}
  metadata.historical_saved_posts=success?0:old.saved_posts||old.historical_saved_posts||0;
  const historical=!success?(prior?.document?.sections||[]).filter(s=>/^(?:已发布逐帖明细|历史逐帖明细)/.test(s.title)).slice(0,6).map((s,i)=>({title:`历史逐帖明细 ${i+1}（非本次更新）`,body:s.body.replace('逐帖指标为本次获取的累计值','逐帖指标为上次成功获取的累计值，非本次更新')})):[];
  const detailSections=historical.length?historical:chunks.map((body,i)=>({title:`已发布逐帖明细 ${i+1}/${chunks.length}`,body}));
  const priorSection={title:'同口径历史与验证指标',body:`上次已同步知识编号：${prior?.id||'无'}；上次来源成功时间：${old.source_last_success_sync||'未知'}。本次${success?'取得部分或全部来源数据，仍按覆盖及缺口判断':'读取失败，未将缺失当作零，保留上次来源成功时间'}。不将不同窗口累计相减作增长；验证指标为窗口完整性、每项已知帖数及下次同口径回读。`};
  docs.push({schema:'grace-private-intelligence-v1',kind:platform,key:platform+'-'+date,title:`${platform} ${date} 私有逐帖指标`,generated_at:generated,period:{from:date,to:date},human_verified:false,source_sha256:await hash(p),sections:[{title:'来源日期与覆盖',body:JSON.stringify(metadata)},...detailSections,priorSection].slice(0,8),evidence:[]});
 }
 return docs;
}
export async function syncDailySocial({client,authorization,fetcher=fetch,now}){
 const previous=[];
 for(const kind of ['tiktok','instagram','facebook','youtube']){const {data,error}=await client.rpc('read_agent_private_intelligence',{p_kind:kind,p_from:null,p_to:null,p_key:null,p_limit:1});if(error)throw Error('私有社媒读取未完成，未开始同步');previous.push(...(data?.documents||[]))}
 const source=await loadSocialMetrics(authorization,fetcher);
 const documents=await socialDailyDocuments(source,previous,now??Date.now());
 const {data,error}=await client.rpc('sync_agent_private_intelligence',{p_documents:documents});if(error)throw Error('社媒私有同步未完成，本次事务未提交');
 const receipts=data?.receipts;if(!Array.isArray(receipts)||receipts.length!==documents.length)throw Error('社媒写入回执不完整，不可宣称已同步');
 for(const r of receipts){
  const receipt=await client.rpc('receipt_agent_private_intelligence',{p_id:r.id});if(receipt.error||receipt.data?.receipt?.digest!==r.digest||receipt.data?.receipt?.key!==r.key||receipt.data?.receipt?.id!==r.id)throw Error('社媒回执校验未完成，请回读现有记录，不要重复采集写入');
  const read=await client.rpc('read_agent_private_intelligence',{p_kind:null,p_from:null,p_to:null,p_key:r.key,p_limit:1});const row=read.data?.documents?.[0],expected=documents.find(d=>d.key===r.key);
  if(read.error||row?.id!==r.id||row?.digest!==r.digest||canonical(row.document)!==canonical(expected))throw Error('社媒内容回读未完成，不能认定Grace已收到完整快照');
 }
 return {receipts,verified:true,coverage:documents.map(d=>({key:d.key,...socialDailyMetadata({document:d})}))};
}
