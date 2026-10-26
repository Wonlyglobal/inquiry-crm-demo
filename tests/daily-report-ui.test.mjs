import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDailyReportController} from '../assets/daily-report-ui.mjs';
import {summarizeDailyLedger} from '../assets/daily-lead-reporting.mjs';

const day='2026-10-26';
const lead=(id,extra={})=>({id,sales_id:'s',recorded_on:day,recorded_at:`${day}T08:00:00Z`,company:`合成客户${id}`,country:'合成地区',source:'outbound',demand:'合成门类需求',method:'manual',inquiry_id:null,converted_at:null,...extra});
const ledger=(leads=[lead('a'),lead('b',{inquiry_id:'inquiry-b',converted_at:`${day}T09:00:00Z`,stage:'contacted'})],extra={})=>({people:[{id:'s',full_name:'合成业务员'}],leads,rules:[{effective_on:'2026-10-26'}],as_of:`${day}T10:00:00Z`,...extra});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};

class NodeStub{
 constructor(tag='div'){this.tagName=tag;this.children=[];this._text='';this.value='';this.disabled=false;this.attributes={};const classes=new Set();this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),toggle:(name,force)=>{const add=force??!classes.has(name);if(add)classes.add(name);else classes.delete(name);return add}}}
 set textContent(value){this._text=String(value??'');this.children=[]}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('')}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this._text='';this.children=[...children]}
 setAttribute(name,value){this.attributes[name]=String(value)}
}

function setup(t,options={}){
 const originalDocument=globalThis.document;
 globalThis.document={createElement:tag=>new NodeStub(tag)};
 t.after(()=>{globalThis.document=originalDocument});
 const nodes=new Map(),$=selector=>{if(!nodes.has(selector))nodes.set(selector,new NodeStub());return nodes.get(selector)};
 $('#daily-date').value=day;$('#daily-history-period').value='month';$('#daily-history-channel').value='';
 const state={profile:{id:'s',role:'sales'},workspace:ledger(),reports:new Map(),reportError:null,reportHook:null,confirm:true,confirmHook:null,scope:{people:[{id:'s',full_name:'合成业务员'}]},managerRows:[],...options};
 const calls=[],reads=[],toasts=[],confirmations=[],opened=[];
 const supabase={
  async rpc(name,args){
   calls.push({name,args});
   if(name==='sales_lead_workspace')return typeof state.workspace==='function'?state.workspace(args):{data:state.workspace,error:null};
   if(name==='get_my_management_scope')return {data:state.scope,error:state.scopeError||null};
   if(name==='save_or_submit_daily_report'){
    if(state.saveError)return {data:null,error:state.saveError};
    const key=`${state.profile.id}:${args.target_date}`,existing=state.reports.get(key);
    if(existing?.status!=='submitted'){
     const metric=summarizeDailyLedger(state.workspace,args.target_date,state.profile.id);
     state.reports.set(key,{sales_id:state.profile.id,report_date:args.target_date,status:args.submit_report?'submitted':'draft',is_simulated:false,new_leads_count:metric.newCount,converted_count:metric.convertedCount,metric_basis:'ledger_recorded_v1',metrics_as_of:metric.asOf,draft_saved_at:metric.asOf,submitted_at:args.submit_report?metric.asOf:null,key_progress:args.key_progress_text,blockers:args.blockers_text,tomorrow_plan:args.tomorrow_plan_text});
    }
    return {data:state.reports.get(key),error:null};
   }
   throw new Error(`Unexpected RPC ${name}`);
  },
  from(table){
   assert.equal(table,'daily_sales_reports','UI must not fall back to old inquiries');
   const query={table,filters:[],columns:''};reads.push(query);
   const result=()=>state.reportHook?state.reportHook(query):{data:state.profile.role==='sales'?(state.reports.get(`${state.profile.id}:${query.filters.find(item=>item[0]==='report_date')?.[1]}`)||null):state.managerRows,error:state.reportError};
   const chain={select(columns){query.columns=columns;return this},eq(key,value){query.filters.push([key,value]);return this},not(key,operator,value){query.filters.push(['not',key,operator,value]);return this},order(){return this},maybeSingle(){return Promise.resolve(result())},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
   return chain;
  },
 };
 const make=()=>createDailyReportController({supabase,getProfile:()=>state.profile,$,today:()=>day,fmtDate:value=>value||'—',displayCountry:value=>value||'—',openInquiryDetail:id=>opened.push(id),toast:message=>toasts.push(message),confirm:async(message,details)=>{confirmations.push({message,details});return state.confirmHook?state.confirmHook():state.confirm}});
 const controller=make();
 return {state,$,nodes,calls,reads,toasts,confirmations,opened,controller,make,saves:()=>calls.filter(call=>call.name==='save_or_submit_daily_report')};
}

test('same-day ledger shows two real entries and one conversion without reading old inquiries',async t=>{
 const h=setup(t);await h.controller.open(day);
 assert.equal(h.$('#daily-new-leads').value,2);assert.match(h.$('#daily-lead-count').textContent,/2 条新增 · 1 条当日转化/);
 assert.equal(h.$('#daily-lead-body').children.length,2);assert.equal(h.reads.length,1);assert.equal(h.reads[0].table,'daily_sales_reports');
 assert.equal(h.$('#submit-daily').disabled,false);
 const unconverted=h.$('#daily-lead-body').children.find(row=>row.textContent.includes('合成客户a'));
 const converted=h.$('#daily-lead-body').children.find(row=>row.textContent.includes('合成客户b'));
 assert.equal(unconverted.onclick,undefined);converted.onkeydown({key:'Enter',preventDefault(){}});assert.deepEqual(h.opened,['inquiry-b']);
});

test('draft save stays unsubmitted across a new controller read; explicit submit confirms and locks the report',async t=>{
 const h=setup(t);await h.controller.open(day);
 h.$('#daily-progress').value='  合成关键进展  ';h.$('#daily-blockers').value='合成困难';h.$('#daily-plan').value='合成计划';
 await h.controller.save(false);
 assert.equal(h.saves().length,1);assert.equal(h.saves()[0].args.submit_report,false);assert.equal(h.confirmations.length,0);
 assert.equal(h.state.reports.get(`s:${day}`).status,'draft');assert.equal(h.state.reports.get(`s:${day}`).submitted_at,null);
 assert.equal(h.state.reports.get(`s:${day}`).new_leads_count,2);assert.equal(h.state.reports.get(`s:${day}`).converted_count,1);
 assert.match(h.$('#daily-save-state').textContent,/草稿已保存/);assert.equal(h.$('#daily-progress').value,'合成关键进展');
 const restored=h.make();await restored.open(day);assert.equal(h.$('#daily-progress').value,'合成关键进展');assert.equal(h.$('#submit-daily').disabled,false);
 h.state.confirm=false;await restored.save(true);assert.equal(h.saves().length,1);
 h.state.confirm=true;await restored.save(true);assert.equal(h.saves().length,2);assert.equal(h.saves()[1].args.submit_report,true);
 assert.match(h.confirmations.at(-1).message,/确认提交这份日报/);assert.match(h.$('#daily-save-state').textContent,/已提交/);assert.equal(h.$('#daily-progress').disabled,true);
 assert.deepEqual(Object.keys(h.saves()[1].args).sort(),['blockers_text','key_progress_text','submit_report','target_date','tomorrow_plan_text']);
 await h.make().open(day);assert.equal(h.$('#submit-daily').disabled,true);assert.equal(h.$('#daily-progress').value,'合成关键进展');
});

test('report-read failure keeps existing narrative locked and cannot overwrite it with an empty save',async t=>{
 const h=setup(t);await h.controller.open(day);h.$('#daily-progress').value='尚未保存的原有文字';
 h.state.reportError=new Error('report unavailable');await h.controller.open(day);
 assert.equal(h.$('#daily-progress').value,'尚未保存的原有文字');assert.equal(h.$('#daily-progress').disabled,true);assert.equal(h.$('#save-daily-draft').disabled,true);assert.match(h.$('#daily-save-state').textContent,/加载失败/);
 await h.controller.save(false);await h.controller.save(true);assert.equal(h.saves().length,0);assert.equal(h.confirmations.length,0);
});

test('refreshing ledger counts preserves all unsaved report fields and makes no report writes',async t=>{
 const h=setup(t);await h.controller.open(day);
 const text={ '#daily-progress':'未保存进展','#daily-blockers':'未保存困难','#daily-plan':'未保存计划'};
 for(const [id,value] of Object.entries(text))h.$(id).value=value;
 h.state.workspace=ledger([...h.state.workspace.leads,lead('c')],{as_of:`${day}T11:00:00Z`});
 await h.controller.refreshLeads();
 for(const [id,value] of Object.entries(text))assert.equal(h.$(id).value,value);
 assert.match(h.$('#daily-lead-count').textContent,/3 条新增 · 1 条当日转化/);assert.equal(h.saves().length,0);assert.equal(h.reads.length,1);
});

test('manager official count excludes drafts, missing timestamps, simulations, wrong days and unauthorized people',async t=>{
 const submitted={sales_id:'s',report_date:day,status:'submitted',submitted_at:`${day}T09:00:00Z`,is_simulated:false,new_leads_count:99,metric_basis:'legacy_inquiries_v1'};
 const h=setup(t,{profile:{id:'manager',role:'sales_manager'},scope:{people:[{id:'s',full_name:'合成销售一'},{id:'s2',full_name:'合成销售二'}]},managerRows:[submitted,submitted,{...submitted,sales_id:'s2',status:'draft'},{...submitted,sales_id:'s2',submitted_at:null},{...submitted,sales_id:'s2',is_simulated:true},{...submitted,sales_id:'s2',report_date:'2026-10-25'},{...submitted,sales_id:'outside'}]});
 await h.controller.open(day);
 assert.equal(h.$('#daily-kpi-total').textContent,'2');assert.equal(h.$('#daily-kpi-submitted').textContent,'1');
 assert.equal(h.$('#daily-kpi-leads').textContent,'2');assert.equal(h.$('#daily-kpi-converted').textContent,'1');
 assert.match(h.$('#daily-summary').textContent,/1\/2 正式提交/);assert.ok(h.reads[0].filters.some(filter=>filter[0]==='status'&&filter[1]==='submitted'));assert.ok(h.reads[0].filters.some(filter=>filter[0]==='not'&&filter[1]==='submitted_at'));
 assert.match(h.$('#daily-report-body').textContent,/旧询盘口径（历史保留）/);
});

test('late responses for a previously opened report cannot replace a newer date or narrative',async t=>{
 const h=setup(t),old=deferred();h.state.reportHook=query=>query.filters.some(filter=>filter[0]==='report_date'&&filter[1]==='2026-10-25')?old.promise:{data:{sales_id:'s',report_date:day,status:'draft',key_progress:'新日期草稿'},error:null};
 const pending=h.controller.open('2026-10-25');await h.controller.open(day);
 old.resolve({data:{sales_id:'s',report_date:'2026-10-25',status:'draft',key_progress:'旧日期迟到草稿'},error:null});await pending;
 assert.equal(h.$('#daily-progress').value,'新日期草稿');assert.match(h.$('#daily-lead-count').textContent,/2 条新增/);assert.equal(h.$('#submit-daily').disabled,false);
});

test('a late ledger refresh cannot overwrite the subsequently opened report date',async t=>{
 const h=setup(t);await h.controller.open(day);const old=deferred();let reads=0;
 h.state.workspace=args=>++reads===1?old.promise:{data:ledger([]),error:null};
 const pending=h.controller.refreshLeads();await h.controller.open('2026-10-25');
 old.resolve({data:ledger(),error:null});await pending;
 assert.match(h.$('#daily-lead-count').textContent,/0 条新增/);
});

test('future and malformed submitted records are read-only and never enable report writes',async t=>{
 const h=setup(t);h.$('#daily-date').value='2026-10-27';await h.controller.open('2026-10-27');assert.equal(h.$('#submit-daily').disabled,true);await h.controller.save(false);assert.equal(h.saves().length,0);
 h.$('#daily-date').value=day;h.state.reports.set(`s:${day}`,{sales_id:'s',report_date:day,status:'submitted',submitted_at:null,new_leads_count:0});await h.controller.open(day);assert.match(h.$('#daily-save-state').textContent,/只读记录/);assert.equal(h.$('#submit-daily').disabled,true);
});

test('submission confirmation cannot apply to a different date opened while the dialog was pending',async t=>{
 const h=setup(t),answer=deferred();await h.controller.open(day);h.state.confirmHook=()=>answer.promise;
 const pending=h.controller.save(true);h.$('#daily-date').value='2026-10-25';await h.controller.open('2026-10-25');
 h.$('#daily-progress').value='另一天的未确认文字';answer.resolve(true);await pending;
 assert.equal(h.saves().length,0);assert.equal(h.$('#daily-progress').value,'另一天的未确认文字');
});

test('history counts one converted opportunity for multiple recorded leads linked to the same inquiry',async t=>{
 const h=setup(t);h.state.workspace=ledger([...h.state.workspace.leads,lead('c',{inquiry_id:'inquiry-b',converted_at:`${day}T09:00:00Z`,stage:'contacted'})]);
 await h.controller.loadHistory();
 assert.equal(h.$('#daily-history-total').textContent,'3');assert.equal(h.$('#daily-history-won').textContent,'1');assert.equal(h.$('#daily-history-valid-rate').textContent,'67%');assert.equal(h.$('#daily-history-active').textContent,'1');
});

test('ledger-specific source labels remain visible in live and filtered historical records',async t=>{
 const h=setup(t);h.state.workspace=ledger([lead('wa',{source:'whatsapp'}),lead('ref',{source:'dealer_referral'})]);await h.controller.open(day);
 assert.match(h.$('#daily-lead-body').textContent,/WhatsApp/);assert.match(h.$('#daily-lead-body').textContent,/经销商转介绍/);
 h.$('#daily-history-channel').value='whatsapp';await h.controller.loadHistory();assert.equal(h.$('#daily-history-total').textContent,'1');assert.match(h.$('#daily-history-body').textContent,/WhatsApp/);
});

test('both CRM entrypoints use the shared controller and canonical ledger entry without discarding report text',()=>{
 for(const path of ['../index.html','../grace.html']){
  const html=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.match(html,/import \{createDailyReportController\} from '\.\/assets\/daily-report-ui\.mjs/);
  assert.match(html,/createDailyReportController\(\{[^\n]+confirm:appConfirm/);
  assert.match(html,/window\.open\('sales-leads\.html','_blank','noopener,noreferrer'\)/);
  assert.match(html,/dailyReportController\.refreshLeads\(\)/);
  const daily=html.slice(html.indexOf('const dailyReportController='),html.indexOf('function localDateTimeValue'));
  assert.doesNotMatch(daily,/from\("inquiries"\)|\$\("#new-inquiry"\)\.click/);
  assert.match(html,/dailyReportsError\?"待核对":missingReports\.length/);
 }
});
