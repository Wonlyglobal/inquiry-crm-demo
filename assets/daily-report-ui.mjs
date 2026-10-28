import {isSubmittedDailyReport,submittedDailySalesIds,summarizeDailyLedger,readDailyLedgerHistory} from './daily-lead-reporting.mjs';
import {leadStageLabel} from './sales-lead-stages.mjs';
import {sources} from './sales-leads.mjs';
const basisLabel=row=>row?.metric_basis==='ledger_recorded_v1'?'实际录入日 · 线索账本':'旧询盘口径（历史保留）';
const entryLabel=row=>row.method==='excel'?'Excel导入':'手动录入';

// All reads use the signed-in client's existing RLS/RPC scope. No service credential,
// report narrative sharing, implicit submission, or outbound notification is added.
export function createDailyReportController({supabase,getProfile,$,today,fmtDate,displayCountry,openInquiryDetail,toast,confirm}){
  let openVersion=0,historyVersion=0,currentDate=null,report=null,ready=false,saving=false;
  let savedText=null;
  const narrative=()=>['#daily-progress','#daily-blockers','#daily-plan'].map(id=>$(id).value);
  const hasUnsavedChanges=()=>ready&&savedText!==null&&JSON.stringify(narrative())!==savedText;
  async function canLeave(){
    if(saving){toast('正在保存日报，请稍候');return false;}
    if(!hasUnsavedChanges())return true;
    const discard=await confirm('日报有尚未保存的修改。离开将丢失这些修改，请先取消并保存草稿。',{title:'未保存的日报',confirmText:'放弃修改并离开'});
    if(discard)savedText=JSON.stringify(narrative());
    return discard;
  }
  function changed(){if(hasUnsavedChanges())text('#daily-save-state','有未保存修改 · 请保存草稿');}
  const controls=['#daily-progress','#daily-blockers','#daily-plan','#save-daily-draft','#submit-daily'];
  const text=(id,value)=>{$(id).textContent=value;};
  const lock=value=>controls.forEach(id=>{$(id).disabled=value;});
  async function workspace(from,to){
    const {data,error}=await supabase.rpc('sales_lead_workspace',{from_day:from,to_day:to});
    if(error)throw error;
    if(!data||!Array.isArray(data.leads)||!Array.isArray(data.people))throw new Error('线索账本返回不完整，请重试');
    return data;
  }
  function leadRow(lead,index,history=false){
    const tr=document.createElement('tr');
    const values=history?[String(index+1),lead.company||lead.contact||'—',lead.demand||'—',displayCountry(lead.country),sources[lead.source]||'其他',entryLabel(lead),leadStageLabel(lead),fmtDate(lead.recorded_at)]:[String(index+1),lead.company||lead.contact||'—',lead.demand||'—',displayCountry(lead.country),sources[lead.source]||'其他',leadStageLabel(lead),fmtDate(lead.recorded_at)];
    values.forEach((value,column)=>{const td=document.createElement('td');td.textContent=value;if(column===2)td.className='daily-lead-title';tr.append(td);});
    if(lead.inquiry_id){tr.tabIndex=0;tr.setAttribute('aria-label',`查看已转化商机：${lead.company||lead.contact||'客户线索'}`);const open=()=>{$('#daily-modal').classList.add('hidden');openInquiryDetail(lead.inquiry_id);};tr.onclick=open;tr.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();open();}};}
    return tr;
  }
  function showLive(data,date){
    const metric=summarizeDailyLedger(data,date,getProfile().id);
    $('#daily-new-leads').value=metric.newCount;
    text('#daily-lead-count',`${metric.newCount} 条新增 · ${metric.convertedCount} 条当日转化`);
    const body=$('#daily-lead-body');body.replaceChildren();
    [...metric.leads].sort((a,b)=>String(b.recorded_at).localeCompare(String(a.recorded_at))).forEach((lead,index)=>body.append(leadRow(lead,index)));
    $('#daily-lead-empty').classList.toggle('hidden',Boolean(metric.newCount));
    text('#daily-metric-asof',`实时账本 · 截至 ${fmtDate(metric.asOf)}（北京时间）。按服务器实际录入日计新增，按转化日单独计商机；历史补录不回填获取日期。`);
    text('#daily-snapshot',report?`${isSubmittedDailyReport(report,date)?'提交':'草稿'}快照：新增 ${report.new_leads_count} 条${report.metric_basis==='ledger_recorded_v1'?` · 当日转化 ${report.converted_count} 条`:''} · ${basisLabel(report)}${report.metrics_as_of?` · 截至 ${fmtDate(report.metrics_as_of)}`:''}。${report.status==='submitted'?'快照已锁定；实时账本后续新增不会改写已提交日报。':'正式提交时重新从服务器核算。'}`:'尚无日报快照；保存或提交时由服务器核算，填写进展不会增加线索数量。');
  }
  async function refreshLeads(){
    if(!currentDate||getProfile()?.role!=='sales'||saving)return;
    const date=currentDate,version=openVersion,button=$('#daily-refresh-leads');button.disabled=true;
    try{const data=await workspace(date,date);if(version===openVersion)showLive(data,date);}catch(error){if(version===openVersion)text('#daily-metric-asof',`实时线索加载失败：${error.message}，不是 0 条。`);toast('线索刷新失败：'+error.message);}finally{button.disabled=false;}
  }
  async function open(date){
    if(!await canLeave()){ $('#daily-date').value=currentDate;return false;}
    const version=++openVersion;currentDate=date;ready=false;report=null;savedText=null;lock(true);
    text('#daily-save-state','正在加载');
    text('#daily-snapshot','正在核对日报快照');text('#daily-metric-asof','正在读取实时账本');
    const profile=getProfile();
    try{
      if(['owner','sales_manager'].includes(profile?.role)){
        ['#daily-kpi-total','#daily-kpi-submitted','#daily-kpi-leads','#daily-kpi-converted'].forEach(id=>text(id,'—'));
        $('#daily-report-body').replaceChildren();text('#daily-summary','正在核对');
        const [scopeResult,reportResult,data]=await Promise.all([
          supabase.rpc('get_my_management_scope'),
          supabase.from('daily_sales_reports').select('sales_id,report_date,status,new_leads_count,converted_count,metric_basis,metrics_as_of,key_progress,blockers,tomorrow_plan,submitted_at,is_simulated,profiles(full_name)').eq('report_date',date).eq('status', 'submitted').not('submitted_at','is',null).order('submitted_at',{ascending:false}),
          workspace(date,date),
        ]);
        if(scopeResult.error||reportResult.error)throw scopeResult.error||reportResult.error;
        if(version!==openVersion)return;
        const people=scopeResult.data?.people;if(!Array.isArray(people))throw new Error('管理范围返回不完整');
        const allowed=new Set(people.map(p=>p.id));
        const reports=(reportResult.data||[]).filter(row=>allowed.has(row.sales_id)&&row.report_date===date&&row.status==='submitted'&&row.submitted_at);
        const realReports=reports.filter(x=>!x.is_simulated);
        const ids=submittedDailySalesIds(realReports,date,people);
        const metric=summarizeDailyLedger({...data,leads:data.leads.filter(row=>allowed.has(row.sales_id))},date);
        text('#daily-kpi-total',people.length);text('#daily-kpi-submitted',ids.size);text('#daily-kpi-leads',metric.newCount);text('#daily-kpi-converted',metric.convertedCount);
        text('#daily-summary',`${ids.size}/${people.length} 正式提交 · 实时账本截至 ${fmtDate(metric.asOf)}`);
        const pending=people.filter(person=>!ids.has(person.id));
        text('#daily-pending-summary',pending.length?`尚未正式提交 ${pending.length} 人：${pending.map(person=>person.full_name||'未命名成员').join('、')}。仅表示当前所选日期的提交状态；草稿、无新增申报不算正式日报。`:'当前范围成员均已正式提交日报。');
        const body=$('#daily-report-body');
        reports.forEach(row=>{const tr=document.createElement('tr');[row.profiles?.full_name||people.find(p=>p.id===row.sales_id)?.full_name||'—',row.is_simulated?'模拟数据':'正式日报',row.new_leads_count,row.metric_basis==='ledger_recorded_v1'?row.converted_count:'—',basisLabel(row)+(row.metrics_as_of?` · ${fmtDate(row.metrics_as_of)}`:''),row.key_progress||'—',row.blockers||'—',row.tomorrow_plan||'—',fmtDate(row.submitted_at)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});body.append(tr);});
        $('#daily-empty').classList.toggle('hidden',Boolean(reports.length));
        return;
      }
      if(profile?.role!=='sales')throw new Error('当前角色无个人日报录入权限');
      text('#daily-lead-count','正在核对');$('#daily-lead-body').replaceChildren();
      const [result,data]=await Promise.all([
        supabase.from('daily_sales_reports').select('sales_id,report_date,new_leads_count,converted_count,metric_basis,metrics_as_of,key_progress,blockers,tomorrow_plan,status,draft_saved_at,submitted_at,is_simulated').eq('sales_id',profile.id).eq('report_date',date).maybeSingle(),
        workspace(date,date),
      ]);
      if(result.error)throw result.error;
      if(version!==openVersion)return;
      report=result.data;showLive(data,date);
      $('#daily-progress').value=report?.key_progress||'';$('#daily-blockers').value=report?.blockers||'';$('#daily-plan').value=report?.tomorrow_plan||'';
      savedText=JSON.stringify(narrative());
      const submitted=isSubmittedDailyReport(report,date);
      // Even malformed submitted legacy rows stay locked, and never count as formal submissions.
      const locked=report?.status==='submitted'||Boolean(report?.submitted_at)||Boolean(report?.is_simulated)||date>today();
      text('#daily-save-state',submitted?`已提交 · ${fmtDate(report.submitted_at)}`:locked?'只读记录 · 请核对状态':report?`草稿已保存 · ${fmtDate(report.draft_saved_at)}`:'未保存');
      ready=!locked;lock(locked);
    }catch(error){
      if(version!==openVersion)return;
      ready=false;lock(true);text('#daily-save-state','加载失败 · 请重新打开');
      text('#daily-pending-summary','提交进度加载失败，不能判定成员未提交');text('#daily-summary','数据加载失败，尚未完成核对');text('#daily-lead-count','待核对');
      text('#daily-snapshot','快照未完成核对');text('#daily-metric-asof','实时账本未完成核对，不能按 0 条解读');
      toast('日报加载失败：'+error.message);
    }
  }
  async function loadHistory(){
    if(getProfile()?.role!=='sales')return;
    const version=++historyVersion,period=$('#daily-history-period').value,channel=$('#daily-history-channel').value,to=today(),[year,month]=to.split('-').map(Number);
    text('#daily-history-summary','正在核对');$('#daily-history-body').replaceChildren();
    ['#daily-history-total','#daily-history-valid-rate','#daily-history-active','#daily-history-won'].forEach(id=>text(id,'—'));
    try{
      // The server returns all rule versions. Their earliest effective day is the
      // ledger's start; do not imply that pre-ledger inquiries are ledger records.
      const current=await workspace(to,to);
      const first=(current.rules||[]).map(rule=>rule.effective_on).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)).sort()[0];
      if(!first)throw new Error('缺少线索账本启用日期，无法确认完整历史');
      const startMonth=period==='year'?1:period==='quarter'?Math.floor((month-1)/3)*3+1:month;
      const from=period==='all'?first:[`${year}-${String(startMonth).padStart(2,'0')}-01`,first].sort().at(-1);
      const result=from>to?{leads:[],conversions:[],asOf:current.as_of}:await readDailyLedgerHistory(workspace,from,to,{salesId:getProfile().id});
      if(version!==historyVersion)return;
      const rows=result.leads.filter(row=>!channel||row.source===channel).sort((a,b)=>String(b.recorded_at).localeCompare(String(a.recorded_at))),converted=rows.filter(row=>Boolean(row.inquiry_id));
      text('#daily-history-total',rows.length);text('#daily-history-valid-rate',rows.length?`${Math.round(converted.length/rows.length*100)}%`:'—');text('#daily-history-active',rows.length-converted.length);text('#daily-history-won',new Set(converted.map(row=>row.inquiry_id)).size);
      text('#daily-history-summary',`${from} 至 ${to} · ${rows.length} 条实际录入 · 截至 ${fmtDate(result.asOf)}`);
      const chips=(target,labeler,empty)=>{const box=$(target);box.replaceChildren();const counts=new Map();rows.forEach(row=>{const label=labeler(row);counts.set(label,(counts.get(label)||0)+1);});if(!counts.size){box.textContent=empty;return;}[...counts].sort((a,b)=>b[1]-a[1]).forEach(([label,count])=>{const chip=document.createElement('span');chip.className='daily-history-chip';const title=document.createElement('span'),value=document.createElement('b');title.textContent=label;value.textContent=count;chip.append(title,value);box.append(chip);});};
      chips('#daily-history-stages',leadStageLabel,'暂无阶段数据');chips('#daily-history-sources',row=>sources[row.source]||'其他','暂无来源数据');
      const body=$('#daily-history-body');rows.forEach((row,index)=>body.append(leadRow(row,index,true)));$('#daily-history-empty').classList.toggle('hidden',Boolean(rows.length));
    }catch(error){if(version===historyVersion){text('#daily-history-summary','加载失败，不能按 0 条解读');$('#daily-history-empty').classList.add('hidden');['#daily-history-stages','#daily-history-sources'].forEach(id=>text(id,'待核对'));}toast('历史线索加载失败：'+error.message);}
  }
  async function save(submitReport){
    if(!ready||saving||currentDate!==$('#daily-date').value)return;
    const date=currentDate,version=openVersion;
    if(submitReport&&!await confirm(`确认提交这份日报？\n\n日期：${date}（北京时间）\n当前核对：${$('#daily-lead-count').textContent}\n\n提交时由服务器重新核算；草稿不算正式提交，无新增申报也不代替日报。提交后不能再修改。`,{title:'提交日报',confirmText:'确认提交'}))return;
    if(!ready||saving||version!==openVersion||date!==currentDate||date!==$('#daily-date').value)return;
    saving=true;lock(true);text('#daily-save-state',submitReport?'正在正式提交…':'正在保存草稿…');
    try{
      const {error}=await supabase.rpc('save_or_submit_daily_report',{target_date:date,key_progress_text:$('#daily-progress').value.trim()||null,blockers_text:$('#daily-blockers').value.trim()||null,tomorrow_plan_text:$('#daily-plan').value.trim()||null,submit_report:submitReport});
      if(error)throw error;
      toast(submitReport?'日报已正式提交':'日报草稿已保存，尚未提交');
      if(version===openVersion){savedText=JSON.stringify(narrative());saving=false;await open(date);}
    }catch(error){toast((submitReport?'日报提交失败：':'草稿保存失败：')+error.message);if(version===openVersion){text('#daily-save-state','保存失败 · 文字已保留，请重试');lock(!ready);}}finally{saving=false;}
  }
  return {open,loadHistory,refreshLeads,save,canLeave,hasUnsavedChanges,changed};
}
