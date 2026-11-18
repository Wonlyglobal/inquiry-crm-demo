import {mountPersonalLeadWorkflow} from './personal-lead-workflow.mjs?v=20261118-spacing1';
import {visibleLeadRows,receiptDestination,leadInformationHtml} from './lead-detail-ui.mjs?v=20261117-details1';
import {mountDevelopmentMetrics} from './lead-development-metrics.mjs?v=20261102-1';
import {decodeCustomerCsv} from './customer-csv-reader.mjs?v=20261029-encoding1';
import {leadWorksheetRecords} from './lead-worksheet-rows.mjs?v=20261029-1';
import {mountWeeklyCustomerReview} from './weekly-customer-review.mjs?v=20261028-1';
import {sources,estimateCurrencies,estimateIssues,localDay,dailyState,summarize,importRows,normalizeLead,leadIssues,leadRequestMessage} from './sales-leads.mjs?v=20261112-estimate1';
import {renderLeadFileState,bindLeadFilePicker,clearLeadImportSelection} from './sales-lead-import-ui.mjs?v=20261029-remove-file1';
import {leadStageLabel,formatStageSummary} from './sales-lead-stages.mjs';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=t=>$('#status').textContent=t,stamp=t=>t?new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
let personalWorkflow,weeklyReview,contactTarget,estimateTarget,developmentMetrics,selectedLeadId=null,pendingSavedFocus=null;
const progressDrafts=new Map();let focusedLeadIds=new Set();
let selectedImportFile=null,importRecords=[];
let db,data,pendingRows=[],requestId=crypto.randomUUID(),busy=false;
const fileNodes={name:$('#file-name'),state:$('#file-state'),remove:$('#remove-import-file')};
$('#remove-import-file').onclick=()=>{if(busy)return;clearLeadImportSelection({input:$('#excel'),preview:$('#import-preview'),confirm:$('#import'),nodes:fileNodes},()=>{pendingRows=[];importRecords=[];selectedImportFile=null;$('#import-acquired-on').value=''});status('已移除待导入文件和预览，未删除已保存线索。可以重新选择文件。');$('#select-file').focus()};
bindLeadFilePicker($('#select-file'),$('#excel'));
renderLeadFileState(fileNodes);
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(leadRequestMessage(error));return data}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button,#from,#to,#sales,#excel,#import-acquired-on').forEach(b=>b.disabled=true);try{await fn()}catch(e){status('未完成：'+leadRequestMessage(e))}finally{busy=false;document.querySelectorAll('button,#from,#to,#sales,#excel,#import-acquired-on').forEach(b=>b.disabled=false);$('#import').disabled=!pendingRows.length}}
const formBaselines=new Map();
function formValue(id){const form=$('#'+id);return form?JSON.stringify([...new FormData(form)].map(([k,v])=>[k,String(v)])):''}
function rememberForm(id){formBaselines.set(id,formValue(id))}
function unsavedForms(){return [...formBaselines].some(([id,value])=>$('#'+id)&&!$('#'+id).closest('[hidden]')&&formValue(id)!==value)}
const labels={complete:'已达标',missing:'未提交',short:'不足目标',no_new:'已申报无新增',exempt:'豁免',weekend:'周末免录'};
async function load({refreshPersonal=true}={}){
 let personalFailure='';status('正在核对服务器数据…');const selected=$('#sales').value;
 data=await rpc('sales_lead_workspace',{from_day:$('#from').value,to_day:$('#to').value});

 const options=data.people.map(p=>`<option value="${esc(p.id)}">${esc(p.full_name)} · ${esc(p.team)}</option>`).join('');
 $('#sales').innerHTML='<option value="">全部可见成员</option>'+options;$('#sales').value=selected;
 $('#exempt-form [name=sales_id]').innerHTML=options;
 if($('#details-add-lead'))$('#details-add-lead').hidden=data.actor.role!=='sales';
 $('#entry').hidden=data.actor.role!=='sales';$('#entry-shortcut').hidden=data.actor.role!=='sales';$('#settings').hidden=!['owner','marketing'].includes(data.actor.role);
 data.timeliness={rules:[],people:[],as_of:data.as_of};data.weekly=[];
 if(data.actor.role==='sales'){
  if(!personalWorkflow){personalWorkflow=mountPersonalLeadWorkflow($('#lead-details'),{rpc,names:Object.fromEntries(data.people.map(p=>[p.id,p.full_name])),status,onChanged:()=>load({refreshPersonal:false})});}
  if(refreshPersonal)try{await personalWorkflow.refresh()}catch(error){personalFailure='本人线索列表';status('个人线索加载失败，可独立重试：'+leadRequestMessage(error))}
 }
 render();
 if(pendingSavedFocus){const id=pendingSavedFocus;pendingSavedFocus=null;if(personalWorkflow)await personalWorkflow.open(id);else showLead(id)}
 $('#rules').textContent=data.rules.map(r=>`${r.effective_on}起：工作日${r.daily_min}条，${r.remind_at}提醒，周${r.weekly_day} ${r.weekly_at}统计；${r.reason}`).join('\n');
 weeklyReview ||= mountWeeklyCustomerReview($('#weekly-customer'),{rpc});
 developmentMetrics ||= mountDevelopmentMetrics($('#development-metrics'),{rpc});
 const tasks=[
  ['日报提交率',async()=>{data.timeliness=await rpc('daily_report_timeliness',{from_day:$('#from').value,to_day:$('#to').value});$('#report-deadline-rules').textContent=data.timeliness.rules.map(r=>`${r.effective_on}起：${r.deadline}截止`).join('；')}],
  ['商机周报',async()=>{data.weekly=await rpc('sales_lead_weekly_reports',{from_day:$('#from').value,to_day:$('#to').value})}],
  ['每周客户核对',async()=>{const weekly=await weeklyReview.refresh({sales:$('#sales').value});if(weekly)$('#customer-deadline-rules').textContent=weekly.rules.map(r=>`${r.effective_on}起：每周客户核对 ${r.due_at} 截止`).join('；')}],
  ['开发指标',()=>developmentMetrics.refresh({from:$('#from').value,to:$('#to').value,sales:$('#sales').value})]
 ];
 const results=await Promise.allSettled(tasks.map(([,fn])=>fn()));render();
 const failures=[...(personalFailure?[personalFailure]:[]),...results.flatMap((r,i)=>r.status==='rejected'?[tasks[i][0]]:[])];
 if(results[0].status==='rejected')$('#timeliness-basis').textContent='日报提交率暂未加载，不能据此判断为零或未提交。';
 if(results[1].status==='rejected')$('#weekly').textContent='商机周报暂未加载，请刷新重试；不影响已保存线索。';
 status(`线索及周期数据已回读 ${stamp(data.as_of)}（北京时间）。`+(failures.length?`辅助模块暂未完成：${failures.join('、')}；已保存线索不受影响，可点击刷新数据重试。`:''));

}
function render(){
 const selectedPerson=$('#sales').value,stats=data.timeliness;
 $('#timeliness-basis').textContent=`服务器核对截至 ${stamp(stats.as_of)}；尚未到期不计入分母。`;
 $('#timeliness-rows').innerHTML=stats.people.filter(p=>!selectedPerson||p.sales_id===selectedPerson).map(p=>`<tr><td>${esc(p.full_name)}</td><td>${p.expected}</td><td>${p.on_time}</td><td>${p.late}</td><td>${p.missing}</td><td>${p.pending}</td><td>${p.rate===null?'—':p.rate+'%'}</td></tr>`).join('')||'<tr><td colspan="7">当前范围暂无统计</td></tr>';

 const sales=$('#sales').value,from=$('#from').value,to=$('#to').value,names=Object.fromEntries(data.people.map(p=>[p.id,p.full_name])),s=summarize(data,sales,from,to);
 $('#kpis').innerHTML=[['实际新增线索',s.leads],['本周期转为商机',s.periodConversions],['无新增申报/人天',s.no_new],['未提交/人天',s.missing]].map(([k,v])=>`<article>${k}<b>${v}</b></article>`).join('');
 $('#ranking').innerHTML=data.people.filter(p=>!sales||p.id===sales).map(p=>{const x=summarize(data,p.id,from,to);return `<tr><td>${esc(p.full_name)}</td>${[x.leads,x.no_new,x.missing,x.short,x.converted,x.conversionRate===null?'—':x.conversionRate+'%',x.periodConversions].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`}).join('');
 $('#weekly').textContent=data.weekly.filter(w=>!sales||w.sales_id===sales).map(w=>`${names[w.sales_id]}｜${w.week_start}周｜截止${stamp(w.cutoff_at)}\n新增${w.summary.new_leads}，本周转化${w.summary.period_conversions}，无新增申报${w.summary.no_new_days}，未提交${w.summary.missing_days}，不足目标${w.summary.short_days}，商机完整跟进${w.summary.followup_count}次（不含线索摘要）；阶段：${formatStageSummary(w.summary.stages)}`).join('\n\n')||'当前周期尚无周报快照；首次按设置时间生成。';
 $('#days').innerHTML=data.days.filter(d=>!sales||d.sales_id===sales).sort((a,b)=>b.day.localeCompare(a.day)).map(d=>{const x=dailyState(d,data.leads);return `<tr>${[names[d.sales_id],d.day,x.count,d.daily_min,labels[x.status],d.exempt_reason||d.no_new_reason||'—',stamp(d.exempt_at||d.declared_at)].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`}).join('');
 renderLeadDetails();
}
function renderLeadDetails(){
 if(personalWorkflow)return;
 const names=Object.fromEntries(data.people.map(p=>[p.id,p.full_name]));
 const rows=visibleLeadRows(data.leads,$('#sales').value,$('#lead-search').value,$('#lead-state').value);
 $('#lead-visible-count').textContent=`${rows.length} 条`;
 $('#leads').innerHTML=rows.map(l=>`<tr data-lead-id="${esc(l.id)}" class="${focusedLeadIds.has(l.id)?'lead-focused':''}"><td><button class="lead-customer-button" data-lead-view="${esc(l.id)}">${esc(l.company||l.contact||'客户线索')}</button><small>${esc(l.contact)} · ${esc(names[l.sales_id])}</small><small>录入 ${esc(stamp(l.recorded_at))}</small></td><td>${esc(l.country)}<small>${esc(l.email||l.phone||'联系方式待补充')}</small></td><td>${esc(sources[l.source]||l.source)}<small>${esc(l.demand)}</small></td><td>${esc(leadStageLabel(l))}<small>${esc(l.progress_note||'尚未记录跟进')} · ${esc(stamp(l.progress_at))}</small><small>${esc(l.estimated_amount??'—')} ${esc(l.currency||'')}</small></td><td><button data-lead-view="${esc(l.id)}" class="button-secondary">查看客户信息</button>${l.sales_id===data.actor.id&&data.actor.role==='sales'?`<button data-progress="${esc(l.id)}" class="button-secondary">记录跟进</button>${!l.inquiry_id&&(l.email||l.phone)?`<button data-convert="${esc(l.id)}">转为个人商机</button>`:''}`:''}${l.inquiry_id&&data.actor.role!=='marketing'?`<a href="/#inquiry/${esc(l.inquiry_id)}" target="_top">打开商机</a>`:''}</td></tr>`).join('')||'<tr><td colspan="5">当前日期或筛选条件下暂无线索，请检查日期范围或清空搜索。</td></tr>';
 const lead=rows.find(l=>l.id===selectedLeadId),panel=$('#lead-information');panel.hidden=!lead;
 if(lead){panel.innerHTML=leadInformationHtml(lead,{actor:data.actor,names,sources,draft:progressDrafts.get(lead.id)||'',stage:leadStageLabel(lead)});
  panel.querySelector('[data-close-lead]').onclick=()=>{selectedLeadId=null;renderLeadDetails()};
  const form=panel.querySelector('#lead-progress-form');
  if(form){const input=form.elements.note;input.oninput=()=>{if(input.value)progressDrafts.set(lead.id,input.value);else progressDrafts.delete(lead.id);panel.querySelector('[data-progress-draft-status]').textContent=input.value?'有未保存的跟进摘要':''};
   panel.querySelector('[data-discard-progress]').onclick=()=>{progressDrafts.delete(lead.id);input.value='';panel.querySelector('[data-progress-draft-status]').textContent='未保存摘要已放弃；已保存记录保持不变'};
   form.onsubmit=event=>{event.preventDefault();action(async()=>{const note=input.value.trim();if(note.length<4||note.length>2000)throw Error('跟进摘要需4—2000字');await rpc('update_sales_lead_progress',{target_id:lead.id,note});progressDrafts.delete(lead.id);try{await load();showLead(lead.id);status('跟进摘要已保存，录入时间与线索数量保持不变。')}catch(error){status('跟进摘要已保存，但列表刷新失败：'+leadRequestMessage(error))}})};
  }
  const cancel=panel.querySelector('[data-cancel-convert]');if(cancel)cancel.onclick=()=>panel.querySelector('[data-convert-review]').hidden=true;
  const confirm=panel.querySelector('[data-confirm-convert]');if(confirm)confirm.onclick=()=>action(async()=>{await rpc('convert_sales_lead',{target_id:lead.id});try{await load();showLead(lead.id);status('已转为本人商机，原线索、来源、录入时间和跟进摘要已保留。')}catch(error){status('转化已完成，但列表刷新失败：'+leadRequestMessage(error))}});
 }
 bindLeadActions();
}
function showLead(id,mode='view'){
 if(personalWorkflow){personalWorkflow.open(id);return}
 selectedLeadId=id;renderLeadDetails();const panel=$('#lead-information');
 if(panel.hidden){$('#lead-save-result').hidden=false;$('#lead-save-result').textContent='返回记录不在当前筛选内，请调整日期或搜索条件后查看。';$('#lead-details').scrollIntoView({block:'start'});return}
 panel.scrollIntoView({block:'center'});panel.focus({preventScroll:true});
 if(mode==='progress')panel.querySelector('[name=note]')?.focus({preventScroll:true});
 if(mode==='convert'){const review=panel.querySelector('[data-convert-review]');if(review){review.hidden=false;review.scrollIntoView({block:'center'})}}
}
function bindLeadActions(){
 $('#lead-details').querySelectorAll('[data-lead-view]').forEach(b=>b.onclick=()=>showLead(b.dataset.leadView));
 $('#lead-details').querySelectorAll('[data-progress]').forEach(b=>b.onclick=()=>showLead(b.dataset.progress,'progress'));
 $('#lead-details').querySelectorAll('[data-convert]').forEach(b=>b.onclick=()=>showLead(b.dataset.convert,'convert'));
 $('#lead-details').querySelectorAll('[data-estimate]').forEach(b=>b.onclick=()=>{const lead=data.leads.find(l=>l.id===b.dataset.estimate);estimateTarget=lead.id;$('#estimate-edit').hidden=false;$('#estimate-customer').textContent=lead.company||lead.contact;$('#estimate-form [name=estimated_amount]').value=lead.estimated_amount??'';const code=lead.currency||'CNY',select=$('#estimate-form [name=currency]');if(![...select.options].some(o=>o.value===code))select.add(new Option(code,code));select.value=code;$('#estimate-edit').scrollIntoView({block:'center'});$('#estimate-form [name=estimated_amount]').focus()});
 $('#lead-details').querySelectorAll('[data-contact]').forEach(b=>b.onclick=()=>{const lead=data.leads.find(l=>l.id===b.dataset.contact);contactTarget=lead.id;$('#contact-edit').hidden=false;$('#contact-customer').textContent=lead.company||lead.contact;$('#contact-edit [name=email]').value=lead.email||'';$('#contact-edit [name=phone]').value=lead.phone||'';$('#contact-edit').scrollIntoView({block:'center'});$('#contact-edit [name=email]').focus()});
}
function prepareSavedLeads(receipts){
 const destination=receiptDestination(receipts,$('#from').value,$('#to').value);
 focusedLeadIds=new Set(Array.isArray(receipts)?receipts.map(r=>r.id):[]);if($('#lead-search'))$('#lead-search').value='';if($('#lead-state'))$('#lead-state').value='all';$('#sales').value='';
 if(destination){$('#from').value=destination.from;$('#to').value=destination.to;selectedLeadId=destination.id;pendingSavedFocus=destination.id}
 if($('#lead-save-result')){$('#lead-save-result').hidden=false;$('#lead-save-result').textContent=`保存结果已返回，重复线索由服务器去重。${destination?.changed?'已切换到该线索的实际录入日期。':''}可直接查看客户信息、记录跟进或转为个人商机。`;}
 return destination?.id;
}
$('#lead-search').oninput=$('#lead-state').onchange=()=>{selectedLeadId=null;renderLeadDetails()};
window.addEventListener('beforeunload',event=>{if(progressDrafts.size||personalWorkflow?.hasUnsaved()||unsavedForms()||pendingRows.length){event.preventDefault();event.returnValue=''}});
$('#lead-form').onsubmit=e=>{e.preventDefault();action(async()=>{const row=normalizeLead(Object.fromEntries(new FormData(e.target)));const issues=leadIssues(row);if(issues.length)throw Error(issues.join('；'));const receipt=await rpc('record_sales_leads',{rows:[{...row,request_id:requestId}],entry_method:'manual'});const focusId=prepareSavedLeads(receipt);requestId=crypto.randomUUID();e.target.reset();e.target.elements.acquired_on.value=localDay();rememberForm('lead-form');try{await load();if(!focusId)$('#lead-details').scrollIntoView({block:'start'})}catch(error){$('#lead-details').scrollIntoView({block:'start'});status('线索已保存，但列表刷新失败。请刷新数据核对：'+leadRequestMessage(error))}})};
$('#estimate-cancel').onclick=()=>{$('#estimate-edit').hidden=true;estimateTarget=null};
$('#estimate-form').onsubmit=e=>{e.preventDefault();action(async()=>{const row=Object.fromEntries(new FormData(e.target));const issues=estimateIssues(row);if(issues.length)throw Error(issues.join('；'));await rpc('update_sales_lead_estimate',{target_id:estimateTarget,amount_value:row.estimated_amount,currency_value:row.currency});$('#estimate-edit').hidden=true;estimateTarget=null;try{await load()}catch(error){status('预计金额已保存，但列表刷新失败：'+leadRequestMessage(error))}})};
$('#contact-cancel').onclick=()=>{$('#contact-edit').hidden=true;contactTarget=null};
$('#contact-form').onsubmit=e=>{e.preventDefault();action(async()=>{const values=Object.fromEntries(new FormData(e.target));await rpc('update_sales_lead_contact',{target_id:contactTarget,email_value:values.email,phone_value:values.phone});$('#contact-edit').hidden=true;contactTarget=null;try{await load()}catch(error){status('联系方式已保存，但列表刷新失败：'+leadRequestMessage(error))}})};
$('#no-new').onclick=()=>action(async()=>{const reason=prompt('请说明今天无新增客户线索的原因（至少4字）');if(reason===null)return;await rpc('declare_no_sales_leads',{target_day:localDay(),reason});await load()});
$('#refresh').onclick=()=>action(load);$('#sales').onchange=()=>{render();weeklyReview?.refresh({sales:$('#sales').value});developmentMetrics?.refresh({from:$('#from').value,to:$('#to').value,sales:$('#sales').value})};
$('#from').onchange=$('#to').onchange=()=>action(load);
$('#rules-form').onsubmit=e=>{e.preventDefault();action(async()=>{const r=Object.fromEntries(new FormData(e.target));r.daily_min=Number(r.daily_min);r.weekly_day=Number(r.weekly_day);await rpc('configure_weekly_customer_rules',r);await load()})};
$('#report-deadline-form').onsubmit=e=>{e.preventDefault();action(async()=>{await rpc('configure_daily_report_deadline',Object.fromEntries(new FormData(e.target)));await load()})};
$('#exempt-form').onsubmit=e=>{e.preventDefault();action(async()=>{await rpc('exempt_sales_lead_day',Object.fromEntries(new FormData(e.target)));await load()})};
async function xlsx(){return import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs')}
$('#template').onclick=()=>action(async()=>{const X=await xlsx(),book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['客户名称','联系人','国家','邮箱','电话','来源','需求简述','获取日期','预计金额','币种']]),'每日客户线索');X.writeFile(book,'WONLY-每日客户线索模板.xlsx')});
function previewLeadRecords(){
 pendingRows=[];
 const rows=importRows(importRecords,{acquiredOn:$('#import-acquired-on').value});
 pendingRows=rows;
 $('#import-preview').textContent=`待导入 ${rows.length} 条，请逐条核对（统一获取日期只补文件中空白的获取日期；预计采购日期不会替代获取日期）：\n`+rows.map((r,i)=>`${i+1}. ${r.company||r.contact}｜${r.country}｜${r.acquired_on}｜${sources[r.source]||r.source}｜${r.email||r.phone||'联系方式待补充'}｜${r.demand}｜预计金额 ${r.estimated_amount??'未填写'} ${r.currency||''}`).join('\n');
 $('#import-preview').hidden=false;renderLeadFileState(fileNodes,{state:'ready',file:selectedImportFile,rowCount:rows.length});status('预览就绪，确认后才写入。历史补录按实际录入日统计，不回填打卡；已在客户管理导入的客户请勿重复计为每日新增。');
}
$('#import-acquired-on').onchange=()=>{if(!importRecords.length)return;action(async()=>{try{previewLeadRecords()}catch(error){$('#import-preview').hidden=true;renderLeadFileState(fileNodes,{state:'error',file:selectedImportFile,error:error.message});throw error}})};
$('#excel').onchange=()=>{const f=$('#excel').files[0];if(!f)return;action(async()=>{
 selectedImportFile=f;importRecords=[];pendingRows=[];$('#import-preview').textContent='';$('#import-preview').hidden=true;renderLeadFileState(fileNodes,{state:'loading',file:f});
 try{
  if(f.size>2*1024*1024)throw Error('文件不得超过2MB');const X=await xlsx(),bytes=await f.arrayBuffer(),book=/\.csv$/i.test(f.name)?X.read(decodeCustomerCsv(bytes),{type:'string',raw:true,cellDates:false,cellFormula:false,bookVBA:false}):X.read(bytes,{type:'array',cellDates:false,cellFormula:false,bookVBA:false});if(book.SheetNames.length!==1)throw Error('请使用单工作表模板，避免漏导其他工作表');importRecords=leadWorksheetRecords(X,book.Sheets[book.SheetNames[0]]);
  previewLeadRecords();
 }catch(error){renderLeadFileState(fileNodes,{state:'error',file:f,error:error.message});throw error}
 finally{$('#excel').value=''}
})};
$('#import').onclick=()=>action(async()=>{if(!pendingRows.length||!confirm(`确认导入${pendingRows.length}条本人线索？`))return;const receipt=await rpc('record_sales_leads',{rows:pendingRows,entry_method:'excel'});const focusId=prepareSavedLeads(receipt);pendingRows=[];importRecords=[];selectedImportFile=null;$('#import-acquired-on').value='';$('#excel').value='';$('#import-preview').textContent='';$('#import-preview').hidden=true;renderLeadFileState(fileNodes,{state:'done'});try{await load();if(!focusId)$('#lead-details').scrollIntoView({block:'start'})}catch(error){$('#lead-details').scrollIntoView({block:'start'});status('导入已保存，但列表刷新失败。请点击刷新数据重试：'+error.message)}});
try{
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');db=createClient('https://plhverjihjilnuhlhlxi.supabase.co','sb_publishable_uDiOI4MTIoHbsQDAqHsH1A_4Db3Hmmw');
 const {data:{user},error}=await db.auth.getUser();if(error||!user)throw Error('请先返回CRM登录，再打开此工作台');
 document.querySelectorAll('select[name=currency]').forEach(s=>{s.innerHTML=Object.entries(estimateCurrencies).map(([code,name])=>`<option value="${code}">${name} ${code}</option>`).join('')});
 $('#to').value=localDay();$('#from').value=$('#to').value.slice(0,8)+'01';$('#lead-form [name=acquired_on]').value=localDay();$('#lead-form [name=source]').innerHTML=Object.entries(sources).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
 for(const id of ['lead-form','contact-form','estimate-form'])rememberForm(id);
 await load();
 const destination=location.hash==='#lead-details'?$('#lead-details'):location.hash==='#entry'&&!$('#entry').hidden?$('#entry'):location.hash==='#lead-dashboard'?$('#lead-dashboard'):location.hash==='#weekly-customer'&&!$('#weekly-customer').hidden?$('#weekly-customer'):null;destination?.scrollIntoView({block:'start'});
}catch(e){status(leadRequestMessage(e))}
