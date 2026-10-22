export const BUSINESS_INTAKE='https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/business-company-intake';
export async function publicResearchSaveError(result){
 let code=result?.data?.error;
 if(!code&&result?.error?.context?.clone)try{code=(await result.error.context.clone().json())?.error}catch{}
 const messages={private_content_not_allowed:'公开事实包含联系方式、报价或其他受限内容，请删除非必要受限内容后重新审核',business_owner_required:'当前账号没有Business公开入库权限',authentication_required:'登录已失效，请重新登录',conflict_refresh_required:'版本冲突，请先回读最新版本再审核',readback_unconfirmed:'保存可能已提交，但回读未确认；请先刷新核对，不要重复提交',invalid_text:'公司、国家或事实内容为空或超长',invalid_public_url:'证据网址必须是无查询参数的公开HTTPS网址',public_review_required:'必须先核对公司身份与公开范围',save_rejected:'数据库拒绝保存，请保留当前事实并联系管理员核对',business_service_unavailable:'Business服务暂不可用，请先回读核对'};
 return messages[code]?`${messages[code]}（${code}）`:'入库结果未确认，请先刷新公司库核对；不要重复提交';
}
export function researchCompanyDomain(value){
 try{const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value),h=u.hostname.toLowerCase().replace(/^www\./,'');
  if(u.protocol!=='https:'||/(^|\.)(web3forms\.com|gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|live\.com|yahoo\.com|icloud\.com|qq\.com|163\.com|126\.com|proton\.me|protonmail\.com|mail\.ru|yandex\.ru|yandex\.com|rambler\.ru|wonlyglobal\.com)$/.test(h))return '';
  return h;
 }catch{return ''}
}
export function websiteFacts(data,day){
 const pages=Array.isArray(data?.website_evidence)?data.website_evidence:[];
 return pages.map(p=>({field:'profile',value:[p.title,p.description,...(p.headings||[])].filter(Boolean).join(' · ').slice(0,1200),source_url:p.url,accessed_at:day,event_date:null,verification:'official_self_report'})).filter(p=>p.value.length>=12&&p.source_url);
}
export const PUBLIC_FACT_FIELDS={profile:'公司画像',company_type:'业务模式',products:'产品与品类',brands:'公开品牌',markets:'市场与应用场景',projects:'公开项目',scale:'有来源的规模',recent_events:'公开动态',risk:'已证实风险'};
export function appendPublicFactRow(container,fact={}){
 const n=container.children.length+1,row=document.createElement('div');row.dataset.publicFactRow='';row.style.cssText='display:grid;gap:8px;border-top:1px solid #d5dfd8;padding:12px 0';
 const select=document.createElement('select');select.className='input';select.dataset.factField='';select.setAttribute('aria-label',`第${n}条公开事实类别`);
 for(const [value,label] of Object.entries(PUBLIC_FACT_FIELDS)){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option)}select.value=fact.field||'profile';
 const value=document.createElement('textarea');value.className='input';value.rows=3;value.dataset.factValue='';value.setAttribute('aria-label',`第${n}条公开事实`);value.placeholder='用自己的话整理公开事实，不填写询盘内容或私人联系方式';value.value=fact.value||'';
 const source=document.createElement('input');source.className='input';source.type='url';source.dataset.factSource='';source.setAttribute('aria-label',`第${n}条证据网址`);source.placeholder='完整公开证据网址（https）';source.value=fact.source_url||'';
 const date=document.createElement('input');date.className='input';date.type='date';date.dataset.factEvent='';date.setAttribute('aria-label',`第${n}条事件日期（未知留空）`);date.value=fact.event_date||'';
 const note=document.createElement('small');note.textContent='事件日期未知留空；本入口保存为官网自述，不能冒充独立核验。';row.append(select,value,source,date,note);container.append(row);
}
export function normalizeEditorFacts(rows,day){
 return rows.filter(r=>r.value?.trim()||r.source_url?.trim()).map(r=>{
  if(!PUBLIC_FACT_FIELDS[r.field]||!r.value?.trim()||!r.source_url?.trim())throw Error('每条公开事实都必须填写类别、内容和证据网址');
  return {field:r.field,value:r.value.trim(),source_url:r.source_url.trim(),accessed_at:day,event_date:r.event_date||null,verification:'official_self_report'};
 });
}
export function collectPublicFactRows(container,day){
 return normalizeEditorFacts([...container.children].map(row=>({field:row.querySelector('[data-fact-field]').value,value:row.querySelector('[data-fact-value]').value,source_url:row.querySelector('[data-fact-source]').value,event_date:row.querySelector('[data-fact-event]').value})),day);
}
export function reviewPublicFacts(company,domain,facts){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.style.cssText='max-width:760px;width:90vw;max-height:85vh;overflow:auto;border:1px solid #cddbd2;border-radius:18px;padding:24px;color:#17211b;background:white';
  const title=document.createElement('h3');title.textContent=`确认公开保存：${company}（${domain}）`;
  const note=document.createElement('p');note.textContent='请确认公司身份与官网一致，并逐条审核以下内容均可公开。不会带入CRM原文、报价或联系人，也不会发送邮件或改变跟进阶段。';
  const list=document.createElement('ol');for(const f of facts){const li=document.createElement('li');li.style.marginBottom='14px';li.textContent=`${PUBLIC_FACT_FIELDS[f.field]}：${f.value}（来源：${f.source_url}；访问：${f.accessed_at}；事件日期：${f.event_date||'未知'}；官网自述）`;list.append(li)}
  let accepted=false;const cancel=document.createElement('button');cancel.type='button';cancel.className='ghost';cancel.textContent='取消入库';cancel.addEventListener('click',()=>dialog.close());
  const submit=document.createElement('button');submit.type='button';submit.className='primary';submit.textContent='确认公开并保存';submit.addEventListener('click',()=>{accepted=true;dialog.close()});
  dialog.append(title,note,list,cancel,submit);dialog.addEventListener('close',()=>{dialog.remove();resolve(accepted)},{once:true});document.body.append(dialog);dialog.showModal();
 });
}
export function mergePublicFacts(previous,incoming){
 const key=f=>JSON.stringify([f.field,f.value,f.source_url,f.event_date,f.verification]);
 const out=[...previous];
 for(const fact of incoming)if(!out.some(x=>key(x)===key(fact)))out.push(fact);
 return out;
}
