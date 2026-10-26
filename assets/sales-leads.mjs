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
export function importRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>200)throw Error('每批导入1—200行');
 const keys={company:'客户名称',contact:'联系人',country:'国家',email:'邮箱',phone:'电话',source:'来源',demand:'需求简述',acquired_on:'获取日期'};
 return rows.map((r,i)=>{const out={request_id:crypto.randomUUID()};for(const [k,label] of Object.entries(keys))out[k]=String(r[label]??r[k]??'').trim();
  if(!out.source)out.source='outbound';
  out.source=Object.entries(sources).find(([k,v])=>out.source===k||out.source===v)?.[0]||out.source;
  if((!out.company&&!out.contact)||!out.country||(!out.email&&!out.phone)||out.demand.length<4||!/^\d{4}-\d{2}-\d{2}$/.test(out.acquired_on)||!sources[out.source])throw Error(`第${i+2}行信息不完整：需客户/联系人、国家、联系方式、来源、需求和YYYY-MM-DD获取日期`);
  return out;
 });
}
