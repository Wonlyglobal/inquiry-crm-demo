import {normalizeCustomerImports} from './customer-import-normalize.mjs?v=20261029-cross1';
export const sources={outbound:'自主开发',website:'官网',email:'邮箱',whatsapp:'WhatsApp',wechat:'微信',phone:'电话',exhibition:'展会',social_media:'社媒',offline_visit:'拜访',dealer_referral:'经销商转介绍',customer_referral:'客户转介绍',internal_referral:'团队转介绍',other:'其他'};
export function localDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function dailyState(day,leads){
 const count=new Set(leads.filter(l=>l.sales_id===day.sales_id&&l.recorded_on===day.day).map(l=>l.id)).size;
 return {count,status:day.exempt_reason?'exempt':day.weekend?'weekend':count>=day.daily_min?'complete':count>0?'short':day.no_new_reason?'no_new':'missing'};
}
export function summarize(data,salesId,from,to){
 const leads=data.leads.filter(l=>(!salesId||l.sales_id===salesId)&&l.recorded_on>=from&&l.recorded_on<=to);
 const days=data.days.filter(d=>(!salesId||d.sales_id===salesId)&&d.day>=from&&d.day<=to);
 const counts={leads:new Set(leads.map(l=>l.id)).size,converted:leads.filter(l=>l.inquiry_id).length,periodConversions:new Set(data.leads.filter(l=>(!salesId||l.sales_id===salesId)&&l.converted_at&&localDay(new Date(l.converted_at))>=from&&localDay(new Date(l.converted_at))<=to).map(l=>l.inquiry_id)).size,missing:0,no_new:0,complete:0,short:0,exempt:0,weekend:0};
 for(const d of days)counts[dailyState(d,data.leads).status]++;
 counts.conversionRate=counts.leads?Math.round(1000*counts.converted/counts.leads)/10:null;
 return counts;
}
export function emptyLeadValue(value){
 const text=String(value??'').trim();return /^(?:[-—–]+|无|暂无|未知|待确认|待补充|n\/a|null)$/i.test(text)?'':text;
}
export function leadIssues(row){
 const issues=[];
 if(!row.company&&!row.contact)issues.push('客户名称或联系人至少填写一项');
 if(!row.country)issues.push('国家未填写');
 if(row.email&&!/^[^\s@;；,，<>]+@[^\s@;；,，<>]+\.[^\s@;；,，<>]+$/.test(row.email))issues.push('邮箱格式不正确（每格只填一个邮箱；未知请留空）');
 if(!sources[row.source])issues.push('来源不正确');
 if((row.company||'').length>300||(row.contact||'').length>200||row.demand.length>10000||JSON.stringify(row).length>15900)issues.push('线索内容超长，请拆分核对，不会截断原文');
 if(row.demand.length<4)issues.push('需求简述至少4字，可填写待跟进方向');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(row.acquired_on)||Number.isNaN(Date.parse(row.acquired_on+'T00:00:00Z'))||new Date(row.acquired_on+'T00:00:00Z').toISOString().slice(0,10)!==row.acquired_on)issues.push('获取日期应为YYYY-MM-DD');
 return issues;
}
export function normalizeLead(row){
 return Object.fromEntries(['company','contact','country','email','phone','source','demand','acquired_on'].map(k=>[k,emptyLeadValue(row[k])]));
}
export function importRows(rows,{acquiredOn=""}={}){
 if(!Array.isArray(rows)||!rows.length||rows.length>200)throw Error('每批导入1—200行');
 const customerFormat=rows.some(r=>Object.hasOwn(r,'公司名称')||Object.hasOwn(r,'客户邮箱')||Object.hasOwn(r,'来源渠道'));
 const keys={company:'客户名称',contact:'联系人',country:'国家',email:'邮箱',phone:'电话',source:'来源',demand:'需求简述',acquired_on:'获取日期'};
 const errors=[];
 const result=rows.map((r,i)=>{const raw={};for(const [k,label] of Object.entries(keys))raw[k]=r[label]??r[k]??'';
  if(customerFormat){
   const aliases={company:'公司名称',email:'客户邮箱',country:'国家/地区',source:'来源渠道',demand:'需求摘要'};
   for(const [k,label] of Object.entries(aliases))raw[k]=r[label]??raw[k];
   const extra={row_number:Number.isInteger(r.__rowNum__)?r.__rowNum__+1:i+2,...raw,source_detail:r['渠道明细']||'',company_type:r['客户类型']||''};
   const normalized=normalizeCustomerImports([extra]).rows[0];
   Object.assign(raw,normalized);
   const notes=[normalized.source_detail];
   for(const label of ['WhatsApp','产品品类','数量','商机标题','预计金额','币种','预计采购日期'])if(String(r[label]??'').trim())notes.push(`${label}（原文件）：${r[label]}`);
   if(!raw.phone)raw.phone=r.WhatsApp||'';
   raw.demand=[normalized.demand,...notes.filter(Boolean)].join('\n');
  }
  if(!String(raw.acquired_on||'').trim())raw.acquired_on=acquiredOn;
  const out=normalizeLead(raw);if(!out.source)out.source='outbound';
  out.source=Object.entries(sources).find(([k,v])=>out.source===k||out.source===v)?.[0]||out.source;
  const issues=leadIssues(out);if(issues.length)errors.push(`第${Number.isInteger(r.__rowNum__)?r.__rowNum__+1:i+2}行：${issues.join('；')}`);
  return {...out,request_id:crypto.randomUUID()};
 });
 if(errors.length)throw Error(errors.join('\n'));
 return result;
}
export function leadRequestMessage(error){
 const message=String(error?.message||error||'未知错误');
 if(/load failed|failed to fetch|network|fetch failed|timeout|timed out/i.test(message))return '网络连接中断，尚未确认保存结果。内容已保留；请先刷新数据核对，再重试原操作，系统会去重。';
 return message;
}
