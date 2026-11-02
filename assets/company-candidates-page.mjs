import {candidateMetrics,candidateTable,candidateDetail} from './company-candidates-ui.mjs?v=20261102-layout1';
import {candidateLabels,candidateSourceLabels,candidateImportRows,candidateBatches,candidateReceipt,candidateColumns} from './company-candidates.mjs?v=20261028-1';
import {localDay,leadRequestMessage} from './sales-leads.mjs?v=20261028-contact-1';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db,view,offset=0,busy=false,chunks=[],done=0,imported=0,deduped=0,target=null;
const status=t=>$('#status').textContent=t,stamp=t=>t?new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
async function rpc(name,args){const result=await db.rpc(name,args);if(result.error)throw Error(leadRequestMessage(result.error));return result.data}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button,#file').forEach(b=>b.disabled=true);try{await fn()}catch(error){status('未完成：'+leadRequestMessage(error))}finally{busy=false;document.querySelectorAll('button,#file').forEach(b=>b.disabled=false);$('#import').disabled=!chunks.length||done===chunks.length;$('#previous').disabled=offset===0;$('#next').disabled=!view||offset+50>=view.total}}
async function load(){
 closeCandidate();
 view=await rpc('company_candidate_workspace',{search_text:$('#search').value.trim(),state_filter:$('#filter').value,page_offset:offset});
 $('#import-panel').hidden=!['owner','marketing'].includes(view.actor.role);
 $('#open-import').hidden=$('#import-panel').hidden;
 $('#counts').innerHTML=candidateMetrics(view);
 $('#candidate-list').innerHTML=candidateTable(view.items);
 $('#page').textContent=view.total?`${offset+1}—${Math.min(offset+50,view.total)} / ${view.total}`:'0 条';
 $('#candidate-list').querySelectorAll('[data-detail]').forEach(button=>button.onclick=()=>openCandidate(view.items.find(item=>item.id===button.dataset.detail)));
 status(`服务器回读 ${stamp(view.as_of)}（北京时间）。候选导入与领取不计入个人线索。`);
}
$('#refresh').onclick=()=>action(async()=>{offset=0;await load()});$('#previous').onclick=()=>action(async()=>{offset=Math.max(0,offset-50);await load()});$('#next').onclick=()=>action(async()=>{offset+=50;await load()});
function closeCandidate(){
 if($('#candidate-dialog').open)$('#candidate-dialog').close();
 for(const kind of ['review','claim','promote'])$('#'+kind+'-panel').hidden=true;
 $('#candidate-detail').innerHTML='';target=null;
}
function openCandidate(item,kind=null){
 if(!item||item.masked)return;
 if(kind==='review'&&!item.can_review||kind==='claim'&&!item.can_claim||kind==='promote'&&(!item.mine||item.lead_id))return;
 target=item;$('#candidate-detail').innerHTML=candidateDetail(item,stamp);
 for(const other of ['review','claim','promote'])$('#'+other+'-panel').hidden=other!==kind;
 if(kind){$('#'+kind+'-company').textContent=item.company;
  if(kind==='review'){$('#review-form').reset();$('#review-form [name=official_url]').value=item.official_url||item.website||''}
  if(kind==='promote'){$('#promote-form').reset();$('#promote-form [name=acquired_on]').value=localDay()}
 }
 for(const actionName of ['review','claim','promote'])$('#candidate-detail').querySelectorAll(`[data-${actionName}]`).forEach(button=>button.onclick=()=>openCandidate(item,actionName));
 if(!$('#candidate-dialog').open)$('#candidate-dialog').showModal();
 if(kind){$('#'+kind+'-panel').scrollIntoView({block:'nearest'});$('#'+kind+'-panel').querySelector('input,select,textarea,button')?.focus()}else $('#close-candidate').focus();
}
$('#close-candidate').onclick=closeCandidate;
$('#candidate-dialog').addEventListener('close',()=>{for(const kind of ['review','claim','promote'])$('#'+kind+'-panel').hidden=true;$('#candidate-detail').innerHTML='';target=null});
$('#open-import').onclick=()=>{$('#candidate-import-details').open=true;$('#import-panel').scrollIntoView({block:'start'});$('#choose-file').focus()};
for(const kind of ['review','claim','promote'])$('#cancel-'+kind).onclick=()=>openCandidate(target);
async function savedThenRefresh(message){closeCandidate();try{await load();status(message+' · 已回读服务器数据')}catch(error){status(message+'，但列表刷新失败：'+leadRequestMessage(error))}}
$('#review-form').onsubmit=e=>{e.preventDefault();action(async()=>{await rpc('review_company_candidate',{target_id:target.id,...Object.fromEntries(new FormData(e.target))});await savedThenRefresh('核验记录已保存')})};
$('#confirm-claim').onclick=()=>action(async()=>{await rpc('claim_company_candidate',{target_id:target.id});await savedThenRefresh('已领取，尚未计入个人线索')});
$('#promote-form').onsubmit=e=>{e.preventDefault();action(async()=>{const result=await rpc('promote_company_candidate',{target_id:target.id,...Object.fromEntries(new FormData(e.target))});if(!result?.lead_id)throw Error('个人线索回执不完整，请刷新核对');await savedThenRefresh('已保存为本人线索，来源记录保留')})};
async function xlsx(){return import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs')}
$('#template').onclick=()=>action(async()=>{const X=await xlsx(),book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([candidateColumns]),'待核实公司候选');X.writeFile(book,'WONLY-公司级候选模板.xlsx')});
$('#choose-file').onclick=()=>$('#file').click();
$('#file').onchange=()=>{const file=$('#file').files[0];if(!file)return;action(async()=>{chunks=[];done=0;imported=0;deduped=0;$('#import-preview').textContent='';$('#filename').textContent=file.name;$('#file-state').textContent='正在读取公司级字段…';try{if(file.size>2*1024*1024)throw Error('文件不能超过2MB');const X=await xlsx(),book=X.read(await file.arrayBuffer(),{type:'array',cellDates:false,sheetRows:2002,cellFormula:false,bookVBA:false});if(book.SheetNames.length!==1)throw Error('请使用单工作表清单');const sheet=book.Sheets[book.SheetNames[0]];if(X.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1').e.r>2000)throw Error('每文件最多2000条');const rows=candidateImportRows(X.utils.sheet_to_json(sheet,{defval:'',raw:false}));chunks=candidateBatches(rows);$('#import-preview').textContent=`待导入 ${rows.length} 家，全部标记为待核实；共 ${chunks.length} 批。\n`+rows.slice(0,10).map((r,i)=>`${i+1}. ${r.company_candidate}｜${r.country_candidate}｜${candidateSourceLabels[r.source_kind]}`).join('\n')+(rows.length>10?'\n仅展示前10条预览，全部字段均已校验。':'');$('#file-state').textContent='预览已准备，点击确认后才保存';status('文件只在浏览器解析，原文件不上传；候选不会计入个人线索。')}catch(error){$('#file-state').textContent='文件未通过校验：'+error.message;throw error}finally{$('#file').value=''}})};
$('#import').onclick=()=>action(async()=>{for(;done<chunks.length;done++){const part=chunks[done];status(`正在保存第 ${done+1}/${chunks.length} 批；已确认新增 ${imported}、重复 ${deduped}。`);const receipt=candidateReceipt(await rpc('import_company_candidates',{rows:part.rows,batch_id:part.id,batch_label:$('#filename').textContent}),part.id,part.rows.length);imported+=receipt.added;deduped+=receipt.deduplicated;$('#file-state').textContent=`已确认 ${done+1}/${chunks.length} 批 · 新增${imported} · 重复${deduped}`;}const message=`导入已保存：新增${imported}、重复${deduped}，个人线索新增0。`;try{offset=0;await load();status(message+' 已回读清单。')}catch(error){status(message+' 列表刷新失败：'+leadRequestMessage(error))}});
try{const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');db=createClient('https://plhverjihjilnuhlhlxi.supabase.co','sb_publishable_uDiOI4MTIoHbsQDAqHsH1A_4Db3Hmmw');const {data:{user},error}=await db.auth.getUser();if(error||!user)throw Error('请先返回CRM登录');await action(load)}catch(error){status(leadRequestMessage(error))}
