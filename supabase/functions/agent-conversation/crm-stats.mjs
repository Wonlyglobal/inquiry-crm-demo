const SOURCES=new Set('website email manual whatsapp wechat phone social_media offline_visit dealer_referral customer_referral internal_referral outbound feishu google_ads meta_ads linkedin exhibition self_developed referral other'.split(' '));
const STAGES=new Set('pending_assignment received qualified contacted quoted sample_sent negotiating won lost'.split(' '));
const COUNTRIES=new Set('KZ MX BR US AE OM SA QA UZ KW BH NG IN GH ID VN MY PH GE AZ KG EG TH ET TZ BD DZ KE PK LK ZA MM MA KH RU PE CO TR PL AF CL EC RO TJ MV UA LA CI JO LB UG MZ MN SN CM AO NP IQ TM CN GB DE FR AU CA AR SG ES IL TW HK MO TL RS CG CD'.split(' '));
const cleanCountry=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').trim().toLowerCase();
const names=new Map();
for(const code of COUNTRIES){names.set(code.toLowerCase(),code);for(const locale of ['en','zh','es','fr']){const label=new Intl.DisplayNames([locale],{type:'region'}).of(code);if(label)names.set(cleanCountry(label),code)}}
for(const [name,code] of Object.entries({'沙特':'SA','迪拜':'AE','印尼':'ID','外蒙':'MN','中国台湾省':'TW','阿曼苏丹国':'OM'}))names.set(cleanCountry(name),code);
export function normalizeCountry(value){
 const parts=String(value||'').split(/[/／]/).map(cleanCountry).filter(Boolean);if(!parts.length||parts.some(p=>!names.has(p)))return 'other_or_unknown';const matches=new Set(parts.map(p=>names.get(p)));return matches.size===1?[...matches][0]:'other_or_unknown';
}
export function summarizeCrm(rows,{start,end},now=Date.now()){
 const safe=rows.filter(r=>!r.excluded_from_dashboard);const source='CRM · 当前登录身份RLS可见记录 · 近30天新增线索批次';
 if(safe.length<5)return {source,period:{start,end},status:'insufficient_sample',limits:'少于5条，不向模型披露明细或小样本统计。'};
 const group=(key,allowed)=>{const counts={};for(const r of safe){const raw=key==='source'?(r.primary_source||r.source):key==='target_country'?normalizeCountry(r[key]):r[key];const label=allowed.has(raw)?raw:'other_or_unknown';counts[label]=(counts[label]||0)+1}return Object.entries(counts).filter(([,count])=>count>=5).map(([label,count])=>({label,count}))};
 const closed=safe.filter(r=>['won','lost'].includes(r.status));
 const overdue=safe.filter(r=>r.validity==='valid'&&!['won','lost'].includes(r.status)&&r.next_follow_up_at&&Date.parse(r.next_follow_up_at)<now).length;
 return {source,period:{start,end},status:'available',lead_count:safe.length,channels:group('source',SOURCES),countries:group('target_country',COUNTRIES),stages:group('status',STAGES),closed_cohort_win_rate:closed.length>=5?Number((closed.filter(r=>r.status==='won').length/closed.length).toFixed(4)):null,overdue_count:overdue>=5?overdue:null,limits:'只统计近30天新增批次；转化率为该批次已关闭记录中成交占比，非同期全部成交率；逾期指有效未关闭记录的下次跟进已过期。小于5条分组不披露，null表示不足以披露，不代表零；未知国家归其他。不是当前看板筛选结果。'};
}
export async function loadCrmStats(client,now=Date.now()){
 const end=new Date(now).toISOString(),start=new Date(now-30*86400000).toISOString();
 const fields='source,primary_source,target_country,status,validity,next_follow_up_at,excluded_from_dashboard';
 try{let rows=[];for(let offset=0;offset<5000;offset+=500){
  const {data,error,count}=await client.from('inquiries').select(fields,{count:'exact'}).gte('created_at',start).lte('created_at',end).order('id').range(offset,offset+499);
  if(error||!Array.isArray(data)||count>5000)throw Error('incomplete');rows.push(...data);if(rows.length===count)return summarizeCrm(rows,{start,end},now);if(data.length<500)throw Error('incomplete');
 }throw Error('incomplete')}catch{return {source:'CRM',period:{start,end},status:'unavailable',limits:'权限内统计未完整读取，不可当作零线索或据此下结论。'}}
}
