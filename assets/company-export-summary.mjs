// Reference: user-supplied 国际工程管控表20261104155008.xls. No fuzzy company joins.
export const templateHeaders=['ID','国家','合作方','合作方所在省份','合作方所在城市','客户类型','项目名称','产品类型','类型','预计金额','币种','出厂价金额','合同号','合同数量','合同总金额（人民币/万元）','网站名称','项目状态','预计下一节点时间','工程总数量','工程信息来源','项目跟进情况','项目联系人姓名','联系方式','联系人职务','未中标原因','原因描述','项目负责人','创建人','创建时间','修改人','修改时间','部门'];
const unique=values=>[...new Set(values.filter(x=>x!==null&&x!==undefined&&String(x)!=='').map(String))].join('\n');
const present=x=>x!==undefined&&x!==null&&x!=='';
export function companySummaryTable(records,trace,display){
 const companies=new Map(records.customers.map(x=>[x.id,x])), contacts=new Map(records.contacts.map(x=>[x.id,x])), projects=new Map();
 const ensure=(id,row={})=>{if(!projects.has(id))projects.set(id,{row,leads:[],followups:[],quotations:[],kind:'related'});return projects.get(id)};
 for(const row of records.opportunities){const p=ensure('inquiry:'+row.id,row);p.kind='opportunity'}
 for(const row of records.leads){const p=ensure(row.inquiry_id?'inquiry:'+row.inquiry_id:'lead:'+row.id,row);p.leads.push(row);if(p.kind==='related'&&!row.inquiry_id)p.kind='lead'}
 for(const kind of ['followups','quotations'])for(const row of records[kind])ensure(row.inquiry_id?'inquiry:'+row.inquiry_id:kind+':'+row.id,row)[kind].push(row);
 const companyId=p=>p.row['关联公司编号']||p.row.company_id||'';
 const represented=new Set([...projects.values()].map(companyId).filter(Boolean));
 for(const c of records.customers)if(!represented.has(c.id)){ensure('company:'+c.id,{...c,company_id:c.id}) .kind='company';represented.add(c.id)}
 for(const c of records.contacts)if(!represented.has(c.company_id)){const id=c.company_id||'contact:'+c.id;ensure('company:'+id,{...c,company_id:id}).kind='company';represented.add(id)}
 const metadata=[];
 const entries=[...projects.entries()].map(([key,p])=>{
  const r=p.row,c=companies.get(companyId(p))||{},ls=p.leads,base=p.kind==='opportunity'?r:{};
  const linked=base.contact_id&&contacts.has(base.contact_id)?[contacts.get(base.contact_id)]:records.contacts.filter(x=>x.company_id===companyId(p));
  const companyName=c.name||r['关联公司名称']||(p.kind==='company'?r.name:r.company)||'';
  const name=r['负责业务员姓名']||unique(ls.map(l=>l['负责业务员姓名']));
  const histories=[...(base.demand_summary?[`需求：${base.demand_summary}`]:[]),...ls.map(l=>unique([l.demand,l.progress_note])),...p.followups.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).map(f=>unique([`${display('created_at',f.created_at||'')} ${display('method',f.method||'')}`,f.content,f.customer_feedback?`客户反馈：${f.customer_feedback}`:''])),...p.quotations.map(q=>unique([`报价：${q.quote_no||q.subject||''} 版本${q.version_no||''}`,present(q.total_amount)?`${q.total_amount} ${q.currency||''}`:'',display('status',q.status||'')]))];
  const amount=present(base.estimated_amount)?base.estimated_amount:(!base.id&&ls.length===1?ls[0].estimated_amount:'');
  const currency=present(amount)?(base.currency||ls[0]?.currency||''):'';
  const row=[base.inquiry_no||'',base.target_country||c.country||r.country||'',companyName,c.province||'',c.city||'',display('company_type',c.company_type||''),base.project_name||base.title||r['关联商机主题']||'',base.product_category||'','',amount??'',currency,'','','','',c.website||c.domain||'',base.id?display('status',base.status||''):p.kind==='lead'?'待开发线索':p.kind==='company'?'尚无商机':'关联商机',display('next_follow_up_at',base.next_follow_up_at||''),base.quantity||'',unique([display('source',base.source||r.source||''),base.source_detail||'']),unique(histories),unique([...linked.map(x=>x.full_name),...ls.map(x=>x.contact),base['联系人姓名']]),unique([...linked.flatMap(x=>[x.email,x.phone,x.whatsapp]),...ls.flatMap(x=>[x.email,x.phone])]),unique(linked.map(x=>x.job_title)),base.status==='lost'?base.lost_reason||'':'','',name,r['记录人姓名']||(p.kind==='lead'?name:''),display('created_at',base.created_at||r.recorded_at||r.created_at||''),'',display('updated_at',base.updated_at||r.progress_at||r.updated_at||''),''];
  metadata.push({key,kind:p.kind,companyId:companyId(p),leadIds:ls.map(x=>x.id),opportunityIds:base.id?[base.id]:[],followupIds:p.followups.map(x=>x.id),quotationIds:p.quotations.map(x=>x.id)});
  return {key,row};
 });
 entries.sort((a,b)=>Number(!a.row[26])-Number(!b.row[26])||String(a.row[26]).localeCompare(String(b.row[26]),'zh-CN')||String(a.row[2]).localeCompare(String(b.row[2]),'zh-CN')||a.key.localeCompare(b.key));
 return {kind:'template',name:'国际工程管控表',keys:templateHeaders,headers:templateHeaders,hiddenFrom:templateHeaders.length,rows:entries.map(x=>x.row),metadata,trace};
}
