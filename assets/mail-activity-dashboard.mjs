import {MAIL_TYPES,mailTypeEsc as esc,mailTypeRows,mailTypeTime} from './sales-mail-types.mjs?v=20261023-3';
const n=v=>Number.isSafeInteger(v)&&v>=0;
const keys=['total','inbound','outbound','unknown_direction','linked','confirmed_total','awaiting_confirmation'];
export function activityRows(people,summary,month){
 const base=mailTypeRows(people,summary,month);
 return people.map(p=>{
  const raw=summary?.people?.find(r=>r.sales_id===p.id),b=base.find(r=>r.id===p.id);
  const available=summary?.activity_schema==='synced-mail-activity-v1'&&b?.available&&raw&&keys.every(k=>n(raw[k]))&&
   raw.inbound+raw.outbound+raw.unknown_direction===raw.total&&raw.confirmed_total+raw.awaiting_confirmation===raw.total&&raw.linked<=raw.total&&
   raw.confirmed_total===Object.entries(b.confirmed).reduce((a,[k,v])=>a+(k==='uncertain'?0:v),0)&&Array.isArray(raw.daily)&&
   raw.daily.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.day)&&d.day.startsWith(month)&&['total','inbound','outbound','linked','confirmed_total','awaiting_confirmation'].every(k=>n(d[k]))&&d.inbound+d.outbound<=d.total&&d.confirmed_total+d.awaiting_confirmation===d.total&&d.linked<=d.total)&&
   new Set(raw.daily.map(d=>d.day)).size===raw.daily.length&&['total','inbound','outbound','linked','confirmed_total','awaiting_confirmation'].every(k=>raw.daily.reduce((a,d)=>a+d[k],0)===raw[k]);
  return {id:p.id,name:p.full_name||'未命名',...raw,available:!!available,confirmed:b?.confirmed};
 });
}
export function renderMailActivity(people,summary,month,today,activity=[]){
 const rows=activityRows(people,summary,month),complete=rows.every(r=>r.available),sum=k=>rows.reduce((a,r)=>a+r[k],0);
 const note='实际收发仅指 CRM 已同步个人邮件，按北京时间邮件日期统计，不代表源邮箱全量；抄送也可能属于收件，不等于本人开发信。已确认不含“待人工确认”，其余（含 AI 建议、跳过、失败和未分类）均待确认。询盘关联量不要求有效或本人负责，未关联不代表无邮件。仅观察，不计绩效。';
 const kpis=[['实际收件','inbound'],['实际发件','outbound'],['已确认分类','confirmed_total'],['待确认','awaiting_confirmation'],['已关联询盘邮件','linked'],['未关联邮件',null]].map(([label,k])=>`<div class="sales-workbench-kpi email-activity-kpi"><span>${label}</span><b>${complete?(k?sum(k):sum('total')-sum('linked')):'—'}</b><small>${complete?'当前筛选 / 已同步范围':'数据缺失或口径未就绪，不显示为0'}</small></div>`).join('');
 const days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate(),limit=month===today.slice(0,7)?Number(today.slice(8,10)):days;
 const daily=Array.from({length:limit},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,'0')}`,values=['inbound','outbound','confirmed_total','awaiting_confirmation','linked'].map(k=>complete?rows.reduce((a,r)=>a+(r.daily.find(d=>d.day===day)?.[k]||0),0):'—');return `<tr><td>${day}</td>${values.map(v=>`<td>${v}</td>`).join('')}</tr>`;}).reverse().join('');
 const trend=`<p class="dashboard-scope-note">${note}</p><details><summary style="cursor:pointer;padding:12px">展开每日邮件活动（按邮件日期）</summary><div class="leaderboard-table-scroll"><table><thead><tr><th>日期</th><th>实际收件</th><th>实际发件</th><th>已确认分类</th><th>待确认</th><th>询盘关联量</th></tr></thead><tbody>${daily}</tbody></table></div></details>`;
 const table=`<div class="leaderboard-table-scroll"><table><thead><tr><th>业务员</th><th>实际收件 / 发件</th><th>已确认分类</th><th>待确认</th><th>询盘关联 / 未关联</th><th>邮箱状态</th><th>操作</th></tr></thead><tbody>${rows.map(r=>{const a=activity.find(v=>v.sales_id===r.id);const categories=r.available?Object.entries(r.confirmed).filter(([k,v])=>k!=='uncertain'&&v>0).map(([k,v])=>`${MAIL_TYPES[k]} ${v}`).join('；'):'';return `<tr><td>${esc(r.name)}</td><td>${r.available?`${r.inbound} / ${r.outbound}${r.unknown_direction?`（方向未知 ${r.unknown_direction}）`:''}`:'—'}</td><td>${r.available?r.confirmed_total:'—'}<small style="display:block">${esc(r.available?(categories||'暂无明确分类'):'统计未就绪')}</small></td><td>${r.available?r.awaiting_confirmation:'—'}</td><td>${r.available?`${r.linked} / ${r.total-r.linked}`:'—'}</td><td>${a?(a.mailbox_status==='connected'?'已连接':'未连接'):'状态未读取'}${a?.sync_has_error?' · 同步异常':''}${a?.last_synced_at?`<small style="display:block">同步 ${esc(mailTypeTime(a.last_synced_at))}</small>`:''}</td><td><button class="table-action" data-mail-activity-review="${esc(r.id)}">查看 / 复核</button><button class="table-action" data-email-observation-sales="${esc(r.id)}">AI观察</button></td></tr>`;}).join('')||'<tr><td colspan="7">当前筛选下没有可见业务员</td></tr>'}</tbody></table></div>${complete?'':'<p class="hint">统计缺失、校验不一致或服务版本未就绪，请刷新；不将缺失伪装为0。</p>'}`;
 return {kpis,trend,table,rows};
}
