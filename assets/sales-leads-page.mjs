import {sources,localDay,dailyState,summarize,importRows} from './sales-leads.mjs';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=t=>$('#status').textContent=t,stamp=t=>t?new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
let db,data,pendingRows=[],requestId=crypto.randomUUID(),busy=false;
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button,#from,#to,#sales').forEach(b=>b.disabled=true);try{await fn()}catch(e){status('未完成：'+e.message)}finally{busy=false;document.querySelectorAll('button,#from,#to,#sales').forEach(b=>b.disabled=false);$('#import').disabled=!pendingRows.length}}
const labels={complete:'已达标',missing:'未提交',short:'不足目标',no_new:'已申报无新增',exempt:'豁免',weekend:'周末免录'};
async function load(){
 status('正在核对服务器数据…');const selected=$('#sales').value;
 data=await rpc('sales_lead_workspace',{from_day:$('#from').value,to_day:$('#to').value});
 data.weekly=await rpc('sales_lead_weekly_reports',{from_day:$('#from').value,to_day:$('#to').value});
 const options=data.people.map(p=>`<option value="${esc(p.id)}">${esc(p.full_name)} · ${esc(p.team)}</option>`).join('');
 $('#sales').innerHTML='<option value="">全部可见成员</option>'+options;$('#sales').value=selected;
 $('#exempt-form [name=sales_id]').innerHTML=options;
 $('#entry').hidden=data.actor.role!=='sales';$('#settings').hidden=!['owner','marketing'].includes(data.actor.role);
 $('#rules').textContent=data.rules.map(r=>`${r.effective_on}起：工作日${r.daily_min}条，${r.remind_at}提醒，周${r.weekly_day} ${r.weekly_at}统计；${r.reason}`).join('\n');
 render();status(`核对时间：${stamp(data.as_of)}（北京时间）；仅展示当前权限范围，未来尚未发生日期不记未提交。`);
}
function render(){
 const sales=$('#sales').value,from=$('#from').value,to=$('#to').value,names=Object.fromEntries(data.people.map(p=>[p.id,p.full_name])),s=summarize(data,sales,from,to);
 $('#kpis').innerHTML=[['实际新增线索',s.leads],['本周期转为商机',s.periodConversions],['无新增申报/人天',s.no_new],['未提交/人天',s.missing]].map(([k,v])=>`<article>${k}<b>${v}</b></article>`).join('');
 $('#ranking').innerHTML=data.people.filter(p=>!sales||p.id===sales).map(p=>{const x=summarize(data,p.id,from,to);return `<tr><td>${esc(p.full_name)}</td>${[x.leads,x.no_new,x.missing,x.short,x.converted,x.conversionRate===null?'—':x.conversionRate+'%',x.periodConversions].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`}).join('');
 $('#weekly').textContent=data.weekly.filter(w=>!sales||w.sales_id===sales).map(w=>`${names[w.sales_id]}｜${w.week_start}周｜截止${stamp(w.cutoff_at)}\n新增${w.summary.new_leads}，本周转化${w.summary.period_conversions}，无新增申报${w.summary.no_new_days}，未提交${w.summary.missing_days}，不足目标${w.summary.short_days}，跟进${w.summary.followup_count}次；阶段：${JSON.stringify(w.summary.stages)}`).join('\n\n')||'当前周期尚无周报快照；首次按设置时间生成。';
 $('#days').innerHTML=data.days.filter(d=>!sales||d.sales_id===sales).sort((a,b)=>b.day.localeCompare(a.day)).map(d=>{const x=dailyState(d,data.leads);return `<tr>${[names[d.sales_id],d.day,x.count,d.daily_min,labels[x.status],d.exempt_reason||d.no_new_reason||'—',stamp(d.exempt_at||d.declared_at)].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`}).join('');
 $('#leads').innerHTML=data.leads.filter(l=>!sales||l.sales_id===sales).map(l=>`<tr><td>${esc(l.company)}<small>${esc(l.contact)}</small></td><td>${esc(names[l.sales_id])}</td><td>${esc(l.country)}<small>${esc(l.email||l.phone)}</small></td><td>${esc(sources[l.source]||l.source)}<small>${esc(l.demand)}</small></td><td>${esc(l.acquired_on)}</td><td>${esc(stamp(l.recorded_at))}<small>${l.method==='excel'?'Excel导入':'手动录入'}</small></td><td>${esc(l.stage||'尚未转化')}<small>${esc(l.progress_note||'尚未更新跟进摘要')} · ${esc(stamp(l.progress_at))}</small><small>${esc(l.estimated_amount??'—')} ${esc(l.currency||'')}</small></td><td>${esc(stamp(l.converted_at))}</td><td>${!l.inquiry_id&&l.sales_id===data.actor.id?`<button data-convert="${esc(l.id)}">转为个人商机</button>`:l.inquiry_id&&data.actor.role!=='marketing'?`<a href="/#inquiry/${esc(l.inquiry_id)}">打开商机</a>`:'已关联'}${l.inquiry_id&&l.sales_id===data.actor.id?`<button data-progress="${esc(l.id)}">更新周跟进摘要</button>`:''}</td></tr>`).join('')||'<tr><td colspan="9">本周期暂无线索，不代表历史无数据</td></tr>';
 $('#leads').querySelectorAll('[data-convert]').forEach(b=>b.onclick=()=>action(async()=>{if(!confirm('确认把这条线索转为本人商机？保留来源、原线索及转化时间。'))return;await rpc('convert_sales_lead',{target_id:b.dataset.convert});await load()}));
 $('#leads').querySelectorAll('[data-progress]').forEach(b=>b.onclick=()=>action(async()=>{const note=prompt('更新本周跟进摘要（市场部及主管可见，请勿填写私有邮件、报价文件、合同或付款资料）');if(note===null)return;await rpc('update_sales_lead_progress',{target_id:b.dataset.progress,note});await load()}));
}
$('#lead-form').onsubmit=e=>{e.preventDefault();action(async()=>{const row=Object.fromEntries(new FormData(e.target));await rpc('record_sales_leads',{rows:[{...row,request_id:requestId}],entry_method:'manual'});requestId=crypto.randomUUID();e.target.reset();e.target.elements.acquired_on.value=localDay();await load()})};
$('#no-new').onclick=()=>action(async()=>{const reason=prompt('请说明今天无新增客户线索的原因（至少4字）');if(reason===null)return;await rpc('declare_no_sales_leads',{target_day:localDay(),reason});await load()});
$('#refresh').onclick=()=>action(load);$('#sales').onchange=()=>render();
$('#from').onchange=$('#to').onchange=()=>action(load);
$('#rules-form').onsubmit=e=>{e.preventDefault();action(async()=>{const r=Object.fromEntries(new FormData(e.target));r.daily_min=Number(r.daily_min);r.weekly_day=Number(r.weekly_day);await rpc('configure_sales_leads',r);await load()})};
$('#exempt-form').onsubmit=e=>{e.preventDefault();action(async()=>{await rpc('exempt_sales_lead_day',Object.fromEntries(new FormData(e.target)));await load()})};
async function xlsx(){return import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs')}
$('#template').onclick=()=>action(async()=>{const X=await xlsx(),book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['客户名称','联系人','国家','邮箱','电话','来源','需求简述','获取日期']]),'每日客户线索');X.writeFile(book,'WONLY-每日客户线索模板.xlsx')});
$('#excel').onchange=()=>action(async()=>{pendingRows=[];$('#import-preview').textContent='';const f=$('#excel').files[0];if(!f)return;if(f.size>2*1024*1024)throw Error('文件不得超过2MB');const X=await xlsx(),book=X.read(await f.arrayBuffer(),{type:'array',cellDates:false,sheetRows:202,cellFormula:false,bookVBA:false});if(book.SheetNames.length!==1)throw Error('请使用单工作表模板，避免漏导其他工作表');if(X.utils.decode_range(book.Sheets[book.SheetNames[0]]['!fullref']||book.Sheets[book.SheetNames[0]]['!ref']||'A1').e.r>200)throw Error('每批最多200条数据，请拆分文件');pendingRows=importRows(X.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:'',raw:false}));$('#import-preview').textContent=`待导入${pendingRows.length}行，文件仅在浏览器读取，不上传原文件。请核对：\n`+pendingRows.map((r,i)=>`${i+1}. ${r.company||r.contact}｜${r.country}｜${r.acquired_on}｜${r.demand}`).join('\n');status('预览就绪，确认后才写入。重复记录由服务器去重。')});
$('#import').onclick=()=>action(async()=>{if(!pendingRows.length||!confirm(`确认导入${pendingRows.length}条本人线索？`))return;await rpc('record_sales_leads',{rows:pendingRows,entry_method:'excel'});pendingRows=[];$('#excel').value='';$('#import-preview').textContent='';await load()});
try{
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');db=createClient('https://plhverjihjilnuhlhlxi.supabase.co','sb_publishable_uDiOI4MTIoHbsQDAqHsH1A_4Db3Hmmw');
 const {data:{user},error}=await db.auth.getUser();if(error||!user)throw Error('请先返回CRM登录，再打开此工作台');
 $('#to').value=localDay();$('#from').value=$('#to').value.slice(0,8)+'01';$('#lead-form [name=acquired_on]').value=localDay();$('#lead-form [name=source]').innerHTML=Object.entries(sources).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
 await load();
}catch(e){status(e.message)}
