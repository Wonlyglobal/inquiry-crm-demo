import {COUNTRY_CODES} from './country-codes.mjs';

const known=new Set(COUNTRY_CODES),display=new Intl.DisplayNames(['zh-CN'],{type:'region'});
export const crmMarketPriorityIntent=q=>!/(?:不要|不用|不按|无需|不采用|不参考|不使用).{0,6}(?:CRM|询盘|线索)/i.test(String(q||''))&&/(?:CRM|询盘|线索).{0,12}(?:重点|优先|主要|排名).{0,5}(?:国家|市场)|(?:重点|优先|主要)国家.{0,12}(?:CRM|询盘|线索)/i.test(String(q||''));
// Use only the existing request-local, RLS-scoped, k>=5 aggregate. Never lower
// its threshold, infer hidden countries, or substitute public research samples.
export function crmMarketPriorityScope(question,crm){
 const q=String(question||'').replace(/；本轮国家[^\n]*$/,'');if(!crmMarketPriorityIntent(q))return {question:q,status:'not_requested',countries:[],note:''};
 const countries=crm?.status==='available'?(crm.countries||[]).filter(r=>known.has(r.label)&&Number.isFinite(r.count)&&r.count>=5).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)).map(r=>r.label):[];
 const date=s=>String(s||'').slice(0,10),period=crm?.period?.start&&crm?.period?.end?`${date(crm.period.start)}至${date(crm.period.end)}`:'本次近30天新增批次';
 const status=countries.length?'available':crm?.status==='available'?'insufficient_groups':crm?.status==='insufficient_sample'?'insufficient_sample':'unavailable';
 const note=countries.length?`重点国家依据：原登录身份权限内CRM ${period}新增批次，只采用达到每组5条展示门槛的国家。研究顺序按该批次询盘数量排列，不代表市场需求、产品销量或国家匹配排名。未披露组不补零，不扩展到历史周期。`:
  status==='unavailable'?'重点国家尚未确定：本次CRM近30天国家汇总读取未完成，不能用旧数据或公开研究样本代替。请稍后重查或明确指定国家。':`重点国家尚未确定：CRM ${period}没有可用于本轮排序的已披露国家分组；每组至少5条的原规则保持。这不表示没有询盘或国家全部未知。请明确本轮国家名单；本次不自行选默认国家、不输出国家匹配或竞争排序。`;
 return {question:countries.length?q+'；本轮国家 '+countries.map(c=>display.of(c)+' '+c).join('、'):q,status,countries,note};
}
export function withCrmMarketPriority(report,priority){
 if(priority.status==='not_requested')return report;
 const answer=priority.note+'\n\n'+report.answer;
 return {...report,answer,crm_priority_status:priority.status};
}
