const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
export function historyMarkup(result){return `<details><summary>线索阶段跟进历史（${Number(result.history_total)||0} 条）</summary><p>本人的线索摘要，包含转化前记录；与商机私有跟进分开，不重复计数。</p><ol>${result.history.map(e=>`<li><strong>${esc(stamp(e.at))}</strong><p style="white-space:pre-wrap">${esc(e.note)}</p>${e.next_action?`<p>下一步：${esc(e.next_action)} · ${esc(stamp(e.next_due_at))} ${e.next_done_at?'已完成':'待完成'}</p>`:''}</li>`).join('')||'<li>尚无线索跟进记录</li>'}</ol><button type="button" class="ghost" data-newer ${result.offset===0?'disabled':''}>较新记录</button><span> ${result.history_total?result.offset+1:0}—${Math.min(result.offset+50,result.history_total)} / ${result.history_total} </span><button type="button" class="ghost" data-older ${result.offset+50>=result.history_total?'disabled':''}>较早记录</button></details>`}
export function mountInquiryLeadHistory(host,{rpc}){
 let sequence=0;
 return {async refresh({inquiryId,ownSales}){const seq=++sequence;host.hidden=true;host.replaceChildren();if(!ownSales)return;
  async function load(offset=0){try{const id=await rpc('personal_sales_lead_for_inquiry',{target_inquiry:inquiryId});if(seq!==sequence||!id)return;const result=await rpc('personal_sales_lead_detail',{target_id:id,history_offset:offset});if(seq!==sequence)return;host.hidden=false;host.innerHTML=historyMarkup(result);host.querySelector('[data-newer]').onclick=()=>load(offset-50);host.querySelector('[data-older]').onclick=()=>load(offset+50);if(offset)host.querySelector('details').open=true}catch{if(seq!==sequence)return;host.hidden=false;host.innerHTML='<p>关联线索跟进历史暂未加载，不代表没有跟进记录。</p><button type="button" class="ghost">重新读取线索历史</button>';host.querySelector('button').onclick=()=>load(offset)}}
  await load();
 }};
}
