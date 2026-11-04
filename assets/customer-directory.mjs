// A view over already-authorized CRM rows. No ownership, lifecycle or ledger writes.
export const customerOrigins={official:'官方分配',personal:'自主开发 / 登记',referral:'转介绍',unknown:'来源待核对'};
const referralSources=new Set(['dealer_referral','customer_referral','internal_referral']);
const progressedStages=new Set(['contacted','qualified','quoted','sample_sent','negotiating','won','lost']);
const stamp=value=>Number.isFinite(Date.parse(value||''))?Date.parse(value):0;
export function customerOrigin(inquiry,origins){
 const origin=origins.get(inquiry.id);
 if(origin==='official')return 'official';
 if(origin==='personal')return referralSources.has(inquiry.source)?'referral':'personal';
 return 'unknown';
}
export function buildCustomerDirectory(inquiries=[],contacts=[],people=[],origins=new Map(),followups=[]){
 const names=new Map(people.map(p=>[p.id,p.full_name||'负责人待核对'])),groups=new Map();
 for(const row of inquiries){
  if(!row.owner_id||row.archived_at||row.merged_into_id||row.excluded_from_dashboard||row.is_test_data||row.data_environment&&row.data_environment!=='production')continue;
  const company=Array.isArray(row.companies)?row.companies[0]:row.companies;
  if(!company?.id)continue;
  const key=JSON.stringify([row.owner_id,company.id]);
  if(!groups.has(key))groups.set(key,{key,company,ownerId:row.owner_id,ownerName:names.get(row.owner_id)||'负责人待核对',inquiries:[]});
  groups.get(key).inquiries.push(row);
 }
 return [...groups.values()].map(group=>{
  const ids=new Set(group.inquiries.map(i=>i.id)),contactIds=new Set(group.inquiries.map(i=>i.contact_id).filter(Boolean));
  const related=followups.filter(f=>ids.has(f.inquiry_id));
  const pending=related.filter(f=>!f.completed_at&&f.next_follow_up_at).map(f=>f.next_follow_up_at);
  pending.push(...group.inquiries.map(i=>i.next_follow_up_at).filter(Boolean));
  const contactRows=contacts.filter(c=>contactIds.has(c.id));
  const sourceKeys=[...new Set(group.inquiries.map(i=>customerOrigin(i,origins)))];
  const stages=[...new Set(group.inquiries.map(i=>i.status).filter(Boolean))];
  return {...group,contacts:contactRows,sourceKeys,stages,
   advanced:group.inquiries.filter(i=>progressedStages.has(i.status)).length,
   unprogressed:group.inquiries.filter(i=>!progressedStages.has(i.status)).length,
   lastFollow:related.map(f=>f.created_at).sort((a,b)=>stamp(b)-stamp(a))[0]||null,
   nextFollow:pending.sort((a,b)=>stamp(a)-stamp(b))[0]||null,
   lastAt:group.inquiries.map(i=>i.updated_at||i.created_at).sort((a,b)=>stamp(b)-stamp(a))[0],
   search:[group.company.name,group.company.country,group.company.domain,group.ownerName,...contactRows.map(c=>c.full_name),...group.inquiries.map(i=>i.title+' '+(i.product_category||''))].join(' ').toLocaleLowerCase(),
  };
 });
}
export function filterCustomerDirectory(rows,state={}){
 const needle=String(state.query||'').trim().toLocaleLowerCase();
 return rows.filter(r=>(!state.owner||r.ownerId===state.owner)&&(!state.origin||r.sourceKeys.includes(state.origin))&&(!state.country||r.company.country===state.country)&&(!state.stage||r.stages.includes(state.stage))&&(!needle||r.search.includes(needle)))
 .sort((a,b)=>state.sort==='name'?String(a.company.name).localeCompare(String(b.company.name),'zh-CN'):stamp(b.lastAt)-stamp(a.lastAt)||a.key.localeCompare(b.key));
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountCustomerDirectory(box,{rows,unassigned=0,state={},formatDate=value=>value||'—',stageLabel=value=>value,channelLabel=value=>value,onCustomer=()=>{},onInquiry=()=>{},onView=()=>{},canEnterLeads=false}){
 Object.assign(state,{query:state.query||'',owner:state.owner||'',origin:state.origin||'',country:state.country||'',stage:state.stage||'',sort:state.sort||'recent',page:state.page||1});
 const pageSize=20;
 let selected=null,opener=null;
 const options=(values,selectedValue)=>values.map(([v,label])=>`<option value="${esc(v)}" ${v===selectedValue?'selected':''}>${esc(label)}</option>`).join('');
 const people=[...new Map(rows.map(r=>[r.ownerId,r.ownerName])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'zh-CN'));
 const countries=[...new Set(rows.map(r=>r.company.country).filter(Boolean))].sort().map(c=>[c,c]);
 const stages=[...new Set(rows.flatMap(r=>r.stages))].map(s=>[s,stageLabel(s)]);
 const originText=r=>r.sourceKeys.map(s=>customerOrigins[s]).join('、');
 box.innerHTML=`<div class="customer-directory-guide"><div><b>业务员客户列表</b><p>这里展示已有负责人的客户档案；日常客户线索在独立账本录入，转化后关联到客户。历史导入记录保留，不自动重算业绩。</p></div><div class="customer-directory-links">${canEnterLeads?'<button type="button" class="ghost" data-directory-view="sales-lead-entry">录入客户线索</button>':''}<button type="button" class="ghost" data-directory-view="sales-leads">查看客户线索</button>${unassigned?`<button type="button" class="ghost" data-directory-view="inquiries">查看官方询盘</button>`:''}</div></div>
 <div class="customer-directory-filters"><label class="customer-directory-query">搜索客户<input class="input" type="search" id="customer-core-search" placeholder="公司、联系人、国家、产品或业务员" value="${esc(state.query)}"></label><label>负责业务员<select class="input" data-directory-filter="owner">${options([['','全部可见业务员'],...people],state.owner)}</select></label><label>客户来源<select class="input" data-directory-filter="origin">${options([['','全部来源'],...Object.entries(customerOrigins)],state.origin)}</select></label><label>国家 / 地区<select class="input" data-directory-filter="country">${options([['','全部国家 / 地区'],...countries],state.country)}</select></label><label>关联阶段<select class="input" data-directory-filter="stage">${options([['','全部阶段'],...stages],state.stage)}</select></label><label>排序<select class="input" id="customer-core-sort">${options([['recent','最近更新'],['name','客户名称']],state.sort)}</select></label><button type="button" class="ghost" data-directory-reset>重置筛选</button></div>
 <div class="customer-directory-results"><p class="customer-directory-summary" role="status"></p><div class="customer-directory-table-scroll"><table class="customer-directory-table"><thead><tr>${['客户 / 国家','负责业务员','客户来源','联系人','关联记录','最近跟进','下次行动','最近更新','操作'].map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody></tbody></table></div><div class="customer-core-pagination"><small data-directory-range></small><div><button id="customer-core-prev" type="button" class="ghost" aria-label="上一页">上一页</button><button id="customer-core-next" type="button" class="ghost" aria-label="下一页">下一页</button></div></div></div><div class="customer-directory-backdrop" hidden></div><aside class="customer-directory-drawer" role="dialog" aria-modal="true" aria-label="客户快速查看" hidden tabindex="-1"></aside>`;
 const get=selector=>box.querySelector(selector),drawer=get('.customer-directory-drawer');
 function close(){drawer.hidden=true;get('.customer-directory-backdrop').hidden=true;selected=null;opener?.focus();opener=null}
 function paint(){
  const filtered=filterCustomerDirectory(rows,state),pages=Math.max(1,Math.ceil(filtered.length/pageSize));state.page=Math.max(1,Math.min(state.page,pages));
  const pageStart=(state.page-1)*pageSize,pageRows=filtered.slice(pageStart,pageStart+pageSize),unique=new Set(filtered.map(r=>r.company.id));
  get('.customer-directory-summary').textContent=`${unique.size} 家客户 · ${filtered.length} 条业务员归属记录 · 同一公司多人跟进时按负责人分别展示。未推进记录不等同于已确认商机。`;
  get('tbody').innerHTML=pageRows.map(r=>`<tr><td><button type="button" class="customer-directory-name" data-directory-open="${esc(r.key)}">${esc(r.company.name||'未命名客户')}</button><small>${esc(r.company.country||'国家待补充')}</small></td><td>${esc(r.ownerName)}</td><td><span class="customer-directory-source">${esc(originText(r))}</span></td><td>${r.contacts.length?esc(r.contacts[0].full_name||'姓名待补充'):'待核对'}${r.contacts.length>1?`<small>共 ${r.contacts.length} 位</small>`:''}</td><td>${r.inquiries.length} 条<small>已推进 ${r.advanced} · 待跟进 ${r.unprogressed}</small></td><td>${esc(r.lastFollow?formatDate(r.lastFollow):'暂无跟进记录')}</td><td>${esc(r.nextFollow?formatDate(r.nextFollow):'待安排')}</td><td>${esc(formatDate(r.lastAt))}</td><td><button type="button" class="ghost" data-directory-open="${esc(r.key)}">查看</button></td></tr>`).join('')||'<tr><td colspan="9">当前筛选下暂无已归属客户，请调整筛选；未转化线索请到客户线索查看。</td></tr>';
  get('[data-directory-range]').textContent=`${filtered.length?pageStart+1:0}–${Math.min(pageStart+pageSize,filtered.length)} / ${filtered.length} · 第 ${state.page} / ${pages} 页`;
  get('.customer-directory-table-scroll').scrollTop=0;
  get('#customer-core-prev').disabled=state.page===1;get('#customer-core-next').disabled=state.page===pages;
 }
 function open(key,button){
  const r=rows.find(r=>r.key===key);if(!r)return;selected=r;opener=button;
  drawer.innerHTML=`<header><div><h3>${esc(r.company.name||'客户详情')}</h3><p>${esc(r.ownerName)} · ${esc(r.company.country||'国家待补充')}</p></div><button type="button" class="ghost" data-directory-close aria-label="关闭客户快速查看">×</button></header><div class="customer-directory-drawer-body"><div class="customer-directory-facts"><span>客户来源</span><b>${esc(originText(r))}</b><span>最近跟进</span><b>${esc(r.lastFollow?formatDate(r.lastFollow):'暂无跟进记录')}</b><span>下次行动</span><b>${esc(r.nextFollow?formatDate(r.nextFollow):'待安排')}</b></div><h3>联系人</h3>${r.contacts.map(c=>`<article><b>${esc(c.full_name||'姓名待补充')}</b><p>${esc([c.email,c.phone,c.whatsapp].filter(Boolean).join(' · ')||'联系方式待补充')}</p></article>`).join('')||'<p class="hint">当前关联记录未指定联系人，请进入客户完整档案核对。</p>'}<h3>关联商机与待跟进记录</h3>${[...r.inquiries].sort((a,b)=>stamp(b.created_at)-stamp(a.created_at)).map(i=>`<article><button type="button" class="customer-directory-name" data-directory-inquiry="${esc(i.id)}">#${esc(String(i.inquiry_no||'').padStart(6,'0'))} · ${esc(i.title||'未命名记录')}</button><p>${esc(stageLabel(i.status))} · ${esc(channelLabel(i.source)||'渠道待补充')}</p><small>建立于 ${esc(formatDate(i.created_at))}</small></article>`).join('')}<p class="hint">来源与阶段分别展示；手动录入或 Excel 导入是录入方式，不会将个人登记视为官方分配。</p></div><footer><button class="ghost" type="button" data-directory-close>返回列表</button><button class="primary" type="button" data-directory-customer>打开完整客户档案</button></footer>`;
  drawer.hidden=false;get('.customer-directory-backdrop').hidden=false;drawer.focus();
 }
 const click=event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-directory-close'))return close();
  if(button.hasAttribute('data-directory-open'))return open(button.dataset.directoryOpen,button);
  if(button.hasAttribute('data-directory-customer')){const id=selected?.company.id;close();if(id)onCustomer(id);return}
  if(button.hasAttribute('data-directory-inquiry')){const id=button.dataset.directoryInquiry;close();onInquiry(id);return}
  if(button.hasAttribute('data-directory-view'))return onView(button.dataset.directoryView);
  if(button.id==='customer-core-prev'){state.page--;paint()}
  if(button.id==='customer-core-next'){state.page++;paint()}
  if(button.hasAttribute('data-directory-reset')){Object.assign(state,{query:'',owner:'',origin:'',country:'',stage:'',sort:'recent',page:1});get('#customer-core-search').value='';box.querySelectorAll('[data-directory-filter]').forEach(el=>el.value='');get('#customer-core-sort').value='recent';paint()}
 };
 const change=event=>{const field=event.target.dataset.directoryFilter;if(field){state[field]=event.target.value;state.page=1;paint()}else if(event.target.id==='customer-core-sort'){state.sort=event.target.value;paint()}};
 const input=event=>{if(event.target.id==='customer-core-search'){state.query=event.target.value;state.page=1;paint()}};
 const keydown=event=>{
  if(drawer.hidden)return;
  if(event.key==='Escape'){event.preventDefault();close()}
  if(event.key==='Tab'){const nodes=[...drawer.querySelectorAll('button:not([disabled]),a[href],input,select,textarea')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(drawer.ownerDocument.activeElement===first||drawer.ownerDocument.activeElement===drawer)){event.preventDefault();last?.focus()}else if(!event.shiftKey&&drawer.ownerDocument.activeElement===last){event.preventDefault();first?.focus()}}
 };
 box.addEventListener('click',click);box.addEventListener('change',change);box.addEventListener('input',input);box.addEventListener('keydown',keydown);get('.customer-directory-backdrop').addEventListener('click',close);
 paint();
 return {destroy(){box.removeEventListener('click',click);box.removeEventListener('change',change);box.removeEventListener('input',input);box.removeEventListener('keydown',keydown);get('.customer-directory-backdrop')?.removeEventListener('click',close);drawer.hidden=true;get('.customer-directory-backdrop').hidden=true}};
}
