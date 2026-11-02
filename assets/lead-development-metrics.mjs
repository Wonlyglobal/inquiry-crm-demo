const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const known=value=>Number.isSafeInteger(value)&&value>=0;
const count=value=>known(value)?value:null;
const subtract=(a,b)=>known(a)&&known(b)&&a>=b?a-b:null;
export const metricRate=(part,total)=>known(part)&&known(total)&&total>0?Math.round(part/total*1000)/10:null;
export function developmentMetrics(row){
 const g=row.goals||{},a=row.actuals||{};
 const actual=a.lead_mode==='manual'?count(a.manual_leads):count(row.ledger_count);
 const sent=count(a.sent),invalid=count(a.invalid),opened=count(a.opened),replied=count(a.replied),success=subtract(sent,invalid);
 return {lead_target:count(g.lead_target),actual,collection_rate:metricRate(actual,g.lead_target),send_target:count(g.send_target),sent,invalid,success,
  success_rate:metricRate(success,sent),unread:subtract(success,opened),opened,unreplied:subtract(opened,replied),replied,reply_rate:metricRate(replied,sent)};
}
export function sumDevelopmentMetrics(rows){
 const entries=rows.map(developmentMetrics),sum=key=>entries.length&&entries.every(r=>known(r[key]))?entries.reduce((n,r)=>n+r[key],0):null;
 const result=Object.fromEntries(['lead_target','actual','send_target','sent','invalid','success','unread','opened','unreplied','replied'].map(k=>[k,sum(k)]));
 return {...result,collection_rate:metricRate(result.actual,result.lead_target),success_rate:metricRate(result.success,result.sent),reply_rate:metricRate(result.replied,result.sent)};
}
const fields=['lead_target','actual','collection_rate','send_target','sent','invalid','success','success_rate','unread','opened','unreplied','replied','reply_rate'];
const cells=metrics=>fields.map(k=>`<td>${metrics[k]===null?'—':esc(metrics[k])+(/rate$/.test(k)?'%':'')}</td>`).join('');
const numeric=(name,label,value)=>`<label>${label}<input name="${name}" type="number" min="0" max="1000000" step="1" value="${esc(value)}" placeholder="未知请留空"></label>`;
export function mountDevelopmentMetrics(root,{rpc}){
 root.innerHTML=`<h2>客户线索开发统计</h2><p>按上方日期和业务员筛选，与十月统计表同列；目标和补录按完整起止日期保存，不自动按天分摊。市场部/老板填写周期目标，业务员填写本人开发信统计。空白表示未知，0表示已核实为零；邮件统计为所填来源的完整周期汇总，不与CRM发件量相加。</p>
 <p>发送成功＝发送总数－失效数量；未读＝发送成功－已读；未回复（原表口径）＝已读－已回复；回复率＝已回复÷发送总数。无可靠阅读数据请留空，客户回复不视为已读追踪证据。</p>
 <div data-development-status role="status" aria-live="polite">正在加载周期统计…</div><div class="scroll"><table class="development-table"><thead>
 <tr><th colspan="3" scope="colgroup">基础信息</th><th colspan="3" scope="colgroup">收集线索</th><th colspan="3" scope="colgroup">发送开发信</th><th colspan="2" scope="colgroup">发送结果</th><th colspan="2" scope="colgroup">阅读情况</th><th colspan="3" scope="colgroup">回复情况</th><th rowspan="2" scope="col">来源 / 填写</th></tr>
 <tr>${['序号','大区','人员','目标','实际','收集率','目标','发送总数','失效数量','发送成功','成功率','未读','已读','未回复（已读未回复）','已回复','回复率'].map(t=>`<th scope="col">${t}</th>`).join('')}</tr></thead><tbody data-development-rows></tbody></table></div>
 <p>实际线索默认来自服务器录入账本；历史汇总可单独补录并标明来源，不回填日报、不改变真实录入时间。小计仅在该项所有人员数据齐全时计算，比例按合计分子÷合计分母计算。当前名单不代表历史任职名单。</p><div data-development-editor hidden></div>`;
 const status=root.querySelector('[data-development-status]'),body=root.querySelector('[data-development-rows]'),editor=root.querySelector('[data-development-editor]');
 let current=null,request=0,saving=false;
 function edit(row,section){
  if(saving)return;
  if(!editor.hidden){status.textContent='请先保存或取消正在填写的记录。';return}
  const period={from:current.from_day,to:current.to_day},g=row.goals||{},a=row.actuals||{},goals=section==='goals';
  editor.hidden=false;
  editor.innerHTML=`<div class="development-editor"><h3>${esc(row.full_name)} · ${goals?'周期目标':'实际统计'}</h3><p>${esc(period.from)} 至 ${esc(period.to)}；保存后保留来源及修改记录。</p><form class="grid">
   ${goals?`<label>大区<input name="region" maxlength="100" value="${esc(g.region)}" placeholder="例如：中东非"></label>${numeric('lead_target','线索收集目标',g.lead_target)}${numeric('send_target','开发信发送目标',g.send_target)}`:
   `<label>线索实际数来源<select name="lead_mode"><option value="ledger" ${a.lead_mode!=='manual'?'selected':''}>CRM实际录入账本</option><option value="manual" ${a.lead_mode==='manual'?'selected':''}>历史汇总补录（不计日报新增）</option></select></label>${numeric('manual_leads','历史汇总线索数',a.manual_leads)}${numeric('sent','发送总数',a.sent)}${numeric('invalid','失效数量',a.invalid)}${numeric('opened','已读数量（需可靠来源）',a.opened)}${numeric('replied','已回复数量',a.replied)}`}
   <label class="wide">${goals?'目标依据 / 修改原因':'数据来源 / 统计范围 / 修改原因'} *<textarea name="note" required minlength="4" maxlength="1000" placeholder="说明统计平台、周期、去重方式；不填客户姓名、邮箱、邮件正文或凭据">${esc((goals?g:a).note)}</textarea></label>
   <p class="wide" data-editor-status role="status" aria-live="polite"></p><div class="button-group wide"><button type="button" data-cancel>取消</button><button type="submit">保存并核对</button></div></form></div>`;
  const form=editor.querySelector('form'),message=editor.querySelector('[data-editor-status]');
  const modeChanged=()=>{if(goals)return;const manual=form.elements.lead_mode.value==='manual';form.elements.manual_leads.disabled=!manual;form.elements.manual_leads.required=manual};modeChanged();
  if(!goals)form.elements.lead_mode.onchange=modeChanged;
  editor.querySelector('[data-cancel]').onclick=()=>{if(saving)return;editor.hidden=true;editor.innerHTML=''};
  form.onsubmit=async e=>{
   e.preventDefault();if(saving)return;
   const values=Object.fromEntries(new FormData(form));
   for(const key of goals?['lead_target','send_target']:['manual_leads','sent','invalid','opened','replied'])values[key]=values[key]===undefined||values[key]===''?null:Number(values[key]);
   if(values.lead_mode==='ledger')values.manual_leads=null;
   saving=true;form.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);message.textContent='正在保存…';
   try{
    await rpc('save_lead_development_metrics',{target_sales:row.sales_id,from_day:period.from,to_day:period.to,section,values_json:values,expected_revision:row.revision});
    editor.hidden=true;editor.innerHTML='';
    status.textContent='已保存。正在刷新周期统计…';
    await refresh(lastFilter);
   }catch(error){message.textContent=`未完成：${error.message}。填写内容已保留。若提示版本变化，请取消后刷新并重新填写。`}
   finally{saving=false;form.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);modeChanged()}
  };
  form.querySelector('input,select')?.focus();
 }
 let lastFilter;
 async function refresh(filter){
  lastFilter=filter;const sequence=++request;
  status.textContent='正在加载周期统计…';
  try{
   const data=await rpc('lead_development_workspace',{from_day:filter.from,to_day:filter.to});if(sequence!==request)return;
   current=data;
   const rows=data.rows.filter(r=>!filter.sales||r.sales_id===filter.sales);
   const groups=new Map();for(const row of rows){const region=row.goals?.region||'大区未设置';if(!groups.has(region))groups.set(region,[]);groups.get(region).push(row)}
   let index=0;
   body.innerHTML=[...groups].map(([region,people])=>people.map(row=>`<tr><td>${++index}</td><td>${esc(region)}</td><td>${esc(row.full_name)}</td>${cells(developmentMetrics(row))}<td><small>${row.actuals?.lead_mode==='manual'?'线索：历史汇总补录':'线索：CRM实际录入账本'}</small><small>${esc(row.actuals?.note||'邮件统计尚未填写')}</small><small>${esc(row.goals?.note||'目标尚未填写')}</small>${row.can_set_goals?`<button type="button" data-goals="${esc(row.sales_id)}">填写目标</button>`:''}${row.can_record?`<button type="button" data-actuals="${esc(row.sales_id)}">填写实际统计</button>`:''}</td></tr>`).join('')+`<tr class="development-total"><th colspan="3" scope="row">${esc(region)}小计</th>${cells(sumDevelopmentMetrics(people))}<td>缺项不按零计算</td></tr>`).join('')+(rows.length?`<tr class="development-total"><th colspan="3" scope="row">当前可见合计</th>${cells(sumDevelopmentMetrics(rows))}<td>当前筛选范围</td></tr>`:'<tr><td colspan="17">当前范围暂无正式在职业务员</td></tr>');
   for(const section of ['goals','actuals'])body.querySelectorAll(`[data-${section}]`).forEach(button=>button.onclick=()=>edit(data.rows.find(r=>r.sales_id===button.dataset[section]),section));
   status.textContent=`${data.from_day} 至 ${data.to_day} · ${rows.length} 人 · 核对时间 ${new Date(data.as_of).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}`;
  }catch(error){if(sequence!==request)return;current=null;body.innerHTML='';status.textContent=`周期统计暂不可用：${error.message}。原线索账本及日报不受影响。`}
 }
 return {refresh};
}
