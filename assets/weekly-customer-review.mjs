import {stageNames} from './sales-lead-stages.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fields={last_contact_on:'最近联系日期',followup_result:'跟进结果',next_action:'下次行动',estimated_amount:'预计金额',currency:'币种',expected_close_date:'预计成交日期'};
export function weeklyCheckDetails(form){
 const data=Object.fromEntries(new FormData(form));const unknown=['last_contact_on','followup_result','next_action'].filter(k=>form.elements['unknown_'+k]?.checked);
 return {last_contact_on:unknown.includes('last_contact_on')?null:data.last_contact_on||null,followup_result:unknown.includes('followup_result')?null:String(data.followup_result||'').trim(),next_action:unknown.includes('next_action')?null:String(data.next_action||'').trim(),unknown_fields:unknown};
}
export function confirmedWeeklyReceipt(receipt,workspace){return Boolean(receipt?.id&&workspace?.items?.some(item=>item.last_check?.id===receipt.id))}
export function mountWeeklyCustomerReview(root,{rpc}){
 let model=null,selected=null,editing=null,busy=false,dirty=false,weekDay=day(),offset=0,sequence=0;
 root.innerHTML='<div class="entry-heading"><div><span class="section-eyebrow">WEEKLY CUSTOMER REVIEW</span><h2>每周客户与商机核对</h2></div><label>核对周（选任意一天）<input type="date" data-week max="'+day()+'" value="'+weekDay+'"></label></div><p data-basis></p><p data-status role="status" aria-live="polite">正在读取周核对要求…</p><div class="scroll"><table><thead><tr><th>业务员</th><th>应核对商机</th><th>截止前已核对</th><th>待核对</th><th>待确认项（已核对）</th><th>核对进度</th></tr></thead><tbody data-people></tbody></table></div><div data-items></div><div data-editor></div>';
 const $=s=>root.querySelector(s),notify=t=>$('[data-status]').textContent=t;
 $('[data-week]').onchange=async e=>{if(editing){e.target.value=weekDay;return notify('请先保存或取消当前核对记录，再切换周。')}weekDay=e.target.value;offset=0;await refresh()};
 const leave=e=>{if(dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave);
 function showEditor(item){
  if(busy)return notify('正在保存，请稍候再操作其他条目。');
  if(editing&&dirty&&!confirm('尚有未保存的核对内容，确认放弃并切换？'))return;
  editing=item;dirty=false;const last=item.last_check||{},source=item.source||{};
  const formFields=['last_contact_on','followup_result','next_action'].map(key=>{const value=last[key]||'',unknown=!value;
   const input=key==='last_contact_on'?`<input name="${key}" type="date" min="1970-01-01" max="${day()}" value="${esc(value)}" ${unknown?'disabled':''}>`:`<textarea name="${key}" minlength="4" maxlength="${key==='followup_result'?2000:1000}" ${unknown?'disabled':''}>${esc(value)}</textarea>`;
   return `<div><label>${fields[key]}${input}</label><label class="weekly-unknown"><input type="checkbox" name="unknown_${key}" ${unknown?'checked':''}> 待确认${key==='last_contact_on'?' / 尚未联系':''}</label></div>`;
  }).join('');
  $('[data-editor]').innerHTML=`<form class="weekly-editor"><h3>本周核对 · ${esc(item.company||item.title)}</h3><p>先在<a href="/#inquiry/${esc(item.id)}" target="_blank" rel="noopener">原商机页面</a>修改真实资料，再在这里核对提交。本入口不改变商机阶段或金额，不会联系客户。</p><div class="weekly-source"><span>当前阶段：${esc(stageNames[source.stage]||'阶段待核实')}</span><span>预计金额：${source.estimated_amount==null?'待确认':esc(source.estimated_amount)+' '+esc(source.currency||'币种待确认')}</span><span>预计成交：${esc(source.expected_close_date||'待确认')}</span></div><p>只记录简短跟进结论和行动，勿粘贴邮件全文、合同、付款或证件资料。空值明确标待确认，不填造数值。</p><div class="grid">${formFields}</div><div class="entry-actions"><p>提交时间由服务器记录；保留每次核对，不覆盖历史。</p><div class="button-group"><button type="button" class="button-secondary" data-cancel>取消</button><button type="submit">本周已核对，保存记录</button></div></div></form>`;
  const form=$('form');form.oninput=()=>{dirty=true};form.onchange=event=>{dirty=true;if(event.target.name?.startsWith('unknown_')){const key=event.target.name.slice(8);form.elements[key].disabled=event.target.checked}};
  $('[data-cancel]').onclick=()=>{editing=null;dirty=false;$('[data-editor]').replaceChildren()};
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{const receipt=await rpc('submit_weekly_customer_check',{target:item.id,details:weeklyCheckDetails(form)});editing=null;dirty=false;$('[data-editor]').replaceChildren();const readback=await refresh();if(!confirmedWeeklyReceipt(receipt,readback)){notify('核对记录已提交，但回读尚未确认；请刷新核对，不要重复提交。');return}notify('已提交并回读 · '+stamp(receipt.recorded_at)+' · 待确认项 '+receipt.unknown_fields.length+' 项；未发送消息或邮件。')}
   catch(error){notify('未完成：'+error.message)}finally{busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false)}
  };
  $('[data-editor]').scrollIntoView({behavior:'smooth',block:'start'});
 }
 function render(){
  if(model.history_unavailable)notify('该周没有冻结核对快照，不以今天的客户状态回填历史。');
  const cutoff=new Date(model.deadline_at),due=cutoff.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
  $('[data-basis]').textContent=`${model.week_start} 当周 · 核对截止 ${due}（北京时间） · ${String(model.dispatch_at||'').slice(0,5)}开始汇总推送。按本人当前未关闭商机逐条核对；没有改动也可提交。核对记录不等于全部待确认项已解决。`;
  $('[data-people]').innerHTML=model.people.map(p=>`<tr><td>${esc(p.full_name)}</td><td>${p.total}</td><td>${p.reviewed}</td><td>${p.pending}</td><td>${p.unknown_fields}</td><td>${p.rate==null?'—':p.rate+'%'}</td></tr>`).join('')||'<tr><td colspan="6">当前权限范围暂无应核对商机</td></tr>';
  const snapshot=model.snapshot;if(snapshot)$('[data-basis]').textContent+=' 已有冻结周报快照，历史不因后续修改重算。';
  if(model.actor.role==='marketing'){$('[data-items]').innerHTML='<p>市场部查看全员核对汇总；客户私有跟进和交易明细沿用原权限。</p>';return}
  const rows=model.items.map(item=>{const r=item.last_check,source=item.source||{},isThisWeek=r?.week_start===model.week_start;
   return `<tr><td>${esc(item.company||item.title)}<small>${esc(item.title)}</small><small>${esc(item.full_name)}</small></td><td>${esc(stageNames[source.stage]||'阶段待核实')}<small>预计 ${source.estimated_amount==null?'待确认':esc(source.estimated_amount)+' '+esc(source.currency||'币种待确认')}</small><small>预计成交 ${esc(source.expected_close_date||'待确认')}</small></td><td>${r?esc(r.last_contact_on||'联系日期待确认'):'待核对'}<small>${esc(r?.followup_result||'跟进结果待确认')}</small><small>下次行动：${esc(r?.next_action||'待确认')}</small></td><td>${new Date(item.created_at)>cutoff?'截止后新建，不计本周应核对数；':''}${isThisWeek?'已提交 '+esc(stamp(r.recorded_at)):'本周尚未核对'}<small>${isThisWeek&&!item.current_values_checked?'商机关键字段已变化，请重新核对':''}</small><small>${isThisWeek&&new Date(r.recorded_at)>cutoff?'截止后提交，不计按时核对':''}</small><small>${esc((r?.unknown_fields||[]).map(k=>fields[k]||k).join('、'))}</small></td><td><a href="/#inquiry/${esc(item.id)}" target="_blank" rel="noopener">打开商机更新</a>${model.can_submit&&item.owner_id===model.actor.id?`<button type="button" data-review="${esc(item.id)}">${isThisWeek?'重新核对':'本周已核对'}</button>`:'<small>由业务员本人提交</small>'}</td></tr>`;
  }).join('');
  $('[data-items]').innerHTML='<div class="scroll"><table><thead><tr><th>客户 / 商机</th><th>当前商机资料</th><th>核对的联系与行动</th><th>实际提交记录</th><th>操作</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="5">当前范围暂无未关闭商机，无需虚构客户或核对记录。</td></tr>')+'</tbody></table></div><div class="weekly-pages"><span>'+Math.min(offset+1,model.total)+'—'+Math.min(offset+model.items.length,model.total)+' / '+model.total+'</span><button type="button" data-prev '+(offset===0?'disabled':'')+'>上一页</button><button type="button" data-next '+(offset+100>=model.total?'disabled':'')+'>下一页</button></div>';
  root.querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>showEditor(model.items.find(item=>item.id===button.dataset.review)));
  $('[data-prev]').onclick=async()=>{if(!editing&&offset>0){offset=Math.max(0,offset-100);await refresh()}};
  $('[data-next]').onclick=async()=>{if(!editing&&offset+100<model.total){offset+=100;await refresh()}};
 }
 async function refresh({sales=selected}={}){
  if(editing){notify('当前核对说明尚未保存，周核对保留原范围；请保存或取消后刷新。');return}
  if(sales!==selected){selected=sales;offset=0}notify('正在核对本周数据…');
  const request=++sequence;
  try{const response=await rpc('weekly_customer_workspace',{week_day:weekDay,target_sales:selected||null,page_offset:offset});if(request!==sequence)return null;model=response;render();notify(model.history_unavailable?'该周没有冻结核对快照，不以当前客户状态回填历史。':'服务器核对截至 '+stamp(model.as_of)+'；核对率与每日线索、日报提交率分别统计。');return model}
  catch(error){if(request===sequence)notify('周核对暂未完成：'+error.message);return null}
 }
 return {refresh,dispose:()=>window.removeEventListener('beforeunload',leave)};
}
