const channels={whatsapp:'whatsapp',微信:'wechat',电话:'phone',展会:'exhibition',官网表单:'website',企业邮箱:'email',社媒:'social_media',线下拜访:'offline_visit',经销商转介绍:'dealer_referral',客户转介绍:'customer_referral','部门 / 团队转介绍':'internal_referral',销售自主开发:'outbound',其他:'other'};
const codes=new Set(['whatsapp','wechat','phone','exhibition','website','email','social_media','offline_visit','dealer_referral','customer_referral','internal_referral','outbound','other']);
const customerType=/^(?:建筑承包商|代理商|制造商|批发商|经销商|进口商|分销商|贸易商|品牌区域分销|子公司)(?:\s*[\/／]\s*(?:代理商|制造商|批发商|经销商|进口商|分销商|贸易商|子公司))*$/;
// Known suffix boundaries recover concatenated email cells; original text is always retained.
export function importEmailCandidates(raw){
 const text=String(raw||'').trim();
 if(!text)return [];
 if(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(text))return [text.toLowerCase()];
 const candidates=[...text.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*?\.(?:com\.kw|co\.uk|com\.au|com|net|org|ae|me|cn|de|fr|it|es|ru|by|in|uk|za|ke|gh)/gi)].map(m=>m[0].toLowerCase());
 return [...new Set(candidates)];
}
export function normalizeCustomerImports(input){
 const warnings=[];
 const rows=input.map(original=>{
  const row={...original};const notes=[];const n=row.row_number;
  const source=String(row.source||'').trim();const normalized=channels[source]|| (codes.has(source.toLowerCase())?source.toLowerCase():null);
  if(!source){
   row.source='other';notes.push('实际获客渠道待确认（原文件未填写）');
   warnings.push(`第${n}行：获客渠道未填写，暂记其他（待确认）`);
  }else if(normalized)row.source=normalized;
  else if(customerType.test(source)){
   row.source='other';notes.push(`客户类型（原来源渠道）：${source}；实际获客渠道待确认`);
   warnings.push(`第${n}行：客户类型“${source}”保留在渠道明细，获客渠道设为其他（待确认）`);
  }else throw new Error(`第${n}行：来源渠道无法识别，请填写实际获客渠道或已知客户类型`);
  if(String(row.company_type||'').trim())notes.push(`客户类型（选填，原文件）：${String(row.company_type).trim()}`);
  const raw=String(row.email||'').trim();
  if(raw){
   const emails=importEmailCandidates(raw);
   // A conventional single address with an uncommon suffix remains supported.
   if(!emails.length&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))row.email=raw.toLowerCase();
   else if(!emails.length)throw new Error(`第${n}行：未能识别有效邮箱，请核对原单元格`);
   else{
    row.email=emails[0];
    if(emails.length>1||raw.toLowerCase()!==row.email){
     notes.push(`原邮箱单元格：${raw}`,`邮箱候选（原文顺序，主邮箱待核对）：${emails.join('；')}`);
     warnings.push(`第${n}行：主邮箱候选 ${row.email}；共${emails.length}个邮箱候选，其余及原文保留在渠道明细，请确认`);
    }
   }
  }
  row.source_detail=[row.source_detail,...notes].filter(Boolean).join('\n');
  if(row.source_detail.length>1000)throw new Error(`第${n}行：保留原文后的渠道明细超过1000字符，请拆分核对，不会截断信息`);
  return row;
 });
 return {rows,warnings};
}
