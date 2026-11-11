const labels={customers:'客户公司',contacts:'联系人',opportunities:'商机',followups:'跟进记录',quotations:'报价',leads:'客户线索'};
const states={pending:'待李铧燕审批',approved:'已批准',rejected:'已驳回',revoked:'已撤回',consumed:'已领取'};
export async function mountCompanyExportButton({client,anchor,openModal,escapeHtml:esc,saveFile}){
 if(!anchor)return;document.getElementById('company-export-open')?.remove();
 const call=async(action,args={})=>{const {data,error}=await client.rpc('company_export_workspace',{action,args});if(error)throw Error(error.message||'导出服务暂不可用');return data};
 let initial;try{initial=await call('list')}catch{return}
 if(!initial?.enabled)return;
 const button=document.createElement('button');button.id='company-export-open';button.type='button';button.className='ghost';button.textContent='全范围导出 / 审批';anchor.parentElement.insertBefore(button,anchor);
 const counts=x=>Object.entries(x||{}).map(([k,n])=>`${labels[k]||k} ${n}`).join(' · ');
 async function show(){
  openModal('客户全范围导出','<p role="status">正在读取授权和导出记录…</p>');
  let data;try{data=await call('list')}catch(e){openModal('客户全范围导出',`<p role="alert">${esc(e.message)}</p>`);return}
  if(!data.enabled){openModal('客户全范围导出','<p>当前授权已撤销。</p>');return}
  openModal('客户全范围导出',`<p class="hint">全公司生产资料，保留原账号角色。指定李铧燕审批后10分钟内可领取一次。日期按北京时间：客户/联系人/商机/跟进/报价按创建日期，线索按录入日期。留空为全历史。不含测试、回收站、银行证件密钥专用字段、附件及原邮件。跟进自由文本中的敏感内容仍需审批人逐项核对。</p>${data.requester?`<form id="company-export-request"><fieldset><legend>导出类别</legend>${Object.entries(labels).map(([k,n])=>`<label style="display:inline-flex;gap:6px;margin:8px"><input type="checkbox" name="kind" value="${k}" checked>${n}</label>`).join('')}</fieldset><div class="detail-grid"><label>开始日期<input class="input" type="date" name="from"></label><label>结束日期<input class="input" type="date" name="to"></label></div><label>导出用途<textarea name="reason" class="input" minlength="8" maxlength="1000" required></textarea></label><button type="submit" class="primary">申请导出</button><p role="status"></p></form>`:''}<h3>申请、审批及领取记录</h3><button type="button" class="ghost" id="company-export-refresh">刷新记录</button><div class="dashboard-table-scroll"><table><thead><tr><th>申请 / 用途</th><th>范围与数量</th><th>状态</th><th>操作</th></tr></thead><tbody>${data.requests.map(r=>`<tr><td>${esc(r.id.slice(0,8))}<br>${esc(r.purpose)}<br>${esc(r.created_at)}<details><summary>查看处理记录</summary>${(r.events||[]).map(e=>`<p>${esc(e.at)} · ${esc(e.actor||'系统')} · ${esc(e.action)}<br>${esc(e.reason)}</p>`).join('')}</details></td><td>${esc(counts(r.counts))}<br>${esc(r.date_from||'全历史')} — ${esc(r.date_to||'至今')}</td><td>${esc(states[r.status]||r.status)}</td><td>${data.approver&&r.status==='pending'?`<button class="ghost" data-preview="${esc(r.id)}">核对并审批</button>`:''}${data.requester&&r.status==='approved'?`<button class="primary" data-download="${esc(r.id)}">领取CSV一次</button>`:''}${['pending','approved'].includes(r.status)?`<button class="ghost" data-revoke="${esc(r.id)}">撤回</button>`:''}</td></tr>`).join('')||'<tr><td colspan="4">暂无申请</td></tr>'}</tbody></table></div><p id="company-export-message" role="status"></p>`);
  document.getElementById('company-export-refresh').onclick=show;
  const form=document.getElementById('company-export-request');
  if(form)form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{const f=new FormData(form);await call('request',{categories:f.getAll('kind'),from:f.get('from'),to:f.get('to'),reason:f.get('reason')});await show()}catch(err){form.querySelector('[role=status]').textContent=err.message;b.disabled=false}};
  for(const b of document.querySelectorAll('[data-preview]'))b.onclick=()=>preview(b.dataset.preview);
  for(const b of document.querySelectorAll('[data-download]'))b.onclick=async()=>{b.disabled=true;try{const file=await call('download',{id:b.dataset.download});saveFile(file.filename,'\ufeff'+file.csv);await show()}catch(e){document.getElementById('company-export-message').textContent=e.message;b.disabled=false}};
  for(const b of document.querySelectorAll('[data-revoke]'))b.onclick=()=>review(b.dataset.revoke,'revoke');
 }
 async function review(id,action,hash){
  openModal('处理导出申请',`<form id="company-export-review"><label>处理依据（至少8字）<textarea class="input" name="reason" minlength="8" maxlength="1000" required></textarea></label><p>操作：${esc({approve:'批准',reject:'驳回',revoke:'撤回'}[action])}。${action==='approve'?'批准后陈笑喻可以领取该快照。':''}</p><button class="primary" type="submit">确认</button><button type="button" class="ghost" id="company-export-back">返回</button><p role="status"></p></form>`);
  const f=document.getElementById('company-export-review');document.getElementById('company-export-back').onclick=show;
  f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;try{await call(action,{id,hash,reason:new FormData(f).get('reason')});await show()}catch(err){f.querySelector('[role=status]').textContent=err.message;b.disabled=false}};
 }
 async function preview(id){
  openModal('核对导出快照','<p role="status">正在读取待审批快照…</p>');
  try{const p=await call('preview',{id});openModal('核对导出快照',`<p class="hint">请核对用途及以下实际内容。发现不应外发的数据请驳回；此处不会发送客户邮件。</p>${Object.entries(p.snapshot).map(([k,rows])=>`<h3>${labels[k]}（${rows.length}条）</h3><pre style="max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(rows,null,2))}</pre>`).join('')}<button class="primary" id="company-export-approve">已核对，批准</button><button class="ghost" id="company-export-reject">驳回</button><button class="ghost" id="company-export-back">返回</button>`);document.getElementById('company-export-approve').onclick=()=>review(id,'approve',p.hash);document.getElementById('company-export-reject').onclick=()=>review(id,'reject',p.hash);document.getElementById('company-export-back').onclick=show}catch(e){openModal('核对导出快照',`<p role="alert">${esc(e.message)}</p>`)}
 }
 button.onclick=show;
}
