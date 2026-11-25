// Email body claims are private input, not independent evidence. Never use sender domains.
export function mailCompanyIdentity(text=''){
 const body=String(text).slice(0,80000).replace(/<[^>]*>/g,' ').replace(/\r/g,'');
 const names=[];
 const add=v=>{v=String(v||'').trim().replace(/[.,;，。；]+$/,'');if(v&&v.length<=120&&!/@|https?:|web3forms|webform|wonly|\n/i.test(v)&&!names.includes(v))names.push(v)};
 for(const m of body.matchAll(/(?:^|\n)\s*(?:company(?:[ _]name)?|公司(?:名称)?)\s*[:：]\s*([^\n]+)/gi))add(m[1]);
 for(const m of body.matchAll(/\b(?:we are|greetings from)\s+([A-Z][A-Za-z0-9 &'’().-]{1,100}?\b(?:Company|Ltd\.?|Limited|LLC|Corporation|Trading|Group))(?=\s+(?:in|based)\b|[,;\n]|$)/gi))add(m[1]);
 const locations=[];
 for(const m of body.matchAll(/(?:^|\n)\s*(?:country|city|location|国家|城市|所在地)\s*[:：]\s*([^\n]+)/gi)){const v=m[1].trim();if(v.length<=100&&!/@|https?:/.test(v))locations.push(v)}
 for(const m of body.matchAll(/\b(?:in|based in)\s+([A-Z][A-Za-z .'-]{1,40},\s*(?:Kingdom of\s+)?[A-Z][A-Za-z .'-]{1,40})(?=[.\n;]|,\s*(?:actively|we))/g))locations.push(m[1].replace(/\s+/g,' ').replace(/\.$/,''));
 return {company:names.length===1?names[0]:'',companies:names,location:[...new Set(locations)].join(' / '),status:names.length>1?'company_match_required':names.length?'self_reported':'missing',verification:'customer_claim'};
}
export function identitySummary(identity,result){
 return ['客户自述（来自邮件原文，未独立证实）：'+[identity.company,identity.location].filter(Boolean).join('；'),
 '公开检索：'+(result.status==='completed'?`取得 ${result.candidates.length} 条候选线索；搜索摘要未阅读全文，不能视为公司事实。`:'本次检索未完成；不能据此判断公司不存在。'),
 '已独立验证事实：本次尚无。',
 '下一步：打开候选原始页面，交叉核对公司名称、所在地与业务；身份唯一后再确认官网。不得仅凭同名或搜索排名认定客户。'].join('\n');
}
