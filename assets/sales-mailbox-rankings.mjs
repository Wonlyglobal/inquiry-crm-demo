// Counts already authorized by get_sales_email_activity_metrics. No new data access or scores.
const count=v=>v!==null&&v!==undefined&&(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function mailboxRankingRows(people,summary,month,today){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!date(today)||summary?.month!==month||summary.error||summary.loading)return [];
 const source=new Map((summary.people||[]).map(r=>[r.sales_id,r])),daily=new Map();
 for(const r of summary.daily||[]){
  if(!date(r.day)||!r.day.startsWith(month+'-')||r.day>today)continue;
  const key=r.sales_id+'|'+r.day;
  if(daily.has(key)){daily.set(key,null);continue} // duplicates are a coverage gap, never double-count
  daily.set(key,r);
 }
 return people.map(p=>{
  const s=source.get(p.id),synced=!!s?.last_synced_at&&Number.isFinite(Date.parse(s.last_synced_at)),syncDay=synced?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.last_synced_at)):null,covered=synced&&syncDay>=month+'-01'&&syncDay<=today,available=!!s&&s.mailbox_status==='connected'&&!s.sync_has_error&&covered&&Array.isArray(summary.daily);
  let received=0,sent=0,replies=0,valid=true;
  for(const [key,r] of daily){if(!key.startsWith(p.id+'|'))continue;if(!r||['total_received','total_sent','reply_sent'].some(k=>count(r[k])===null)){valid=false;continue}received+=count(r.total_received);sent+=count(r.total_sent);replies+=count(r.reply_sent);}
  const usable=available&&valid&&[received,sent,replies].every(Number.isSafeInteger);
  return {id:p.id,name:p.full_name||'未命名业务员',total_received:usable?received:null,total_sent:usable?sent:null,reply_sent:usable?replies:null,development_sent:count(s?.development_sent),customer_inbound:count(s?.customer_inbound),mature_7d_sent:count(s?.mature_7d_sent),replied_7d:count(s?.replied_7d),replied_in_period:count(s?.replied_in_period),replied_within_24h:count(s?.replied_within_24h),median_reply_minutes:s?.median_reply_minutes!=null&&Number.isFinite(Number(s.median_reply_minutes))&&Number(s.median_reply_minutes)>=0?Number(s.median_reply_minutes):null,pending_replies:count(s?.pending_replies),overdue_replies:count(s?.overdue_replies),ai_pending_review:count(s?.ai_pending_review),mailbox_status:!s?'数据缺失':s.sync_has_error?'同步异常':s.mailbox_status!=='connected'?'未连接':!synced?'尚未同步':!covered?'同步未覆盖所选月份':!usable?'统计数据缺失':'已连接 · 仅已同步记录',last_synced_at:synced?s.last_synced_at:null};
 });
}
export function rankedMailbox(rows,key){
 let previous=null,rank=0;
 return rows.filter(r=>r[key]!==null&&r[key]>0).slice().sort((a,b)=>b[key]-a[key]||a.name.localeCompare(b.name,'zh-CN')).map((r,i)=>{if(r[key]!==previous)rank=i+1;previous=r[key];return {...r,rank,value:r[key]}});
}
export function renderMailboxRankings(rows,month){
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=v=>v==null?'—':esc(v),rate=(a,b)=>a==null||!b||a>b?'—':`${(a/b*100).toFixed(1)}%`;
 const board=(title,key)=>{const ranked=rankedMailbox(rows,key);return `<section class="leaderboard"><div class="leaderboard-head"><b>${title}</b><span class="dashboard-scope-note">${esc(month)} · 仅已同步记录，不计销售评分</span></div><div class="leaderboard-table-scroll"><table><thead><tr><th>名次</th><th>成员</th><th>封数</th></tr></thead><tbody>${ranked.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.value}</td></tr>`).join('')||'<tr><td colspan="3">暂无可排名的非零记录；缺失和0均不评第一</td></tr>'}</tbody></table></div></section>`};
 return board('阿里邮箱总发件榜','total_sent')+board('阿里邮箱总收件榜','total_received')+`<section class="leaderboard" style="grid-column:1/-1"><div class="leaderboard-head"><b>业务员个人邮件数据</b><span class="dashboard-scope-note">${esc(month)} · 与上方邮件榜同月；非阿里邮箱全量验收，不据此评价员工绩效</span></div><div class="leaderboard-table-scroll"><table><thead><tr><th>成员</th><th>阿里收件</th><th>阿里发件</th><th>CRM开发信</th><th>已关联客户来信</th><th>CRM回复</th><th>7天开发信回复率</th><th>24小时内回复 / 中位分钟</th><th>待回复 / 超时</th><th>AI待复核</th><th>连接与同步状态</th><th>最近同步</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${n(r.total_received)}</td><td>${n(r.total_sent)}</td><td>${n(r.development_sent)}</td><td>${n(r.customer_inbound)}</td><td>${n(r.reply_sent)}</td><td>${r.mature_7d_sent>=5?rate(r.replied_7d,r.mature_7d_sent):'— · 成熟样本不足5封'}</td><td>${rate(r.replied_within_24h,r.replied_in_period)} / ${n(r.median_reply_minutes)}</td><td>${n(r.pending_replies)} / ${n(r.overdue_replies)}</td><td>${n(r.ai_pending_review)}</td><td>${esc(r.mailbox_status)}</td><td>${esc(r.last_synced_at?new Date(r.last_synced_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'—')}</td></tr>`).join('')||'<tr><td colspan="12">当前筛选下没有可见业务员</td></tr>'}</tbody></table></div><p class="dashboard-scope-note">阿里收发包含系统已同步的个人邮箱记录；CRM开发信仅成功发送审计，已关联来信只计有效询盘。未连接/未同步/同步异常的邮箱收发显示—并不参与数量榜；读取失败不生成排行。回复率沿用成熟样本至少5封规则。</p></section>`;
}
