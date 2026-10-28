export const candidateLabels={pending:'待核实',verified:'已核实 · 可领取',rejected:'暂不采用',claimed:'已领取',promoted:'已转个人线索',existing:'已有人维护'};
export const candidateSourceLabels={company_site_candidate:'官网域名候选（未自动核实）',third_party_source_candidate:'第三方来源候选',customs_record_candidate:'海关记录候选（非当前采购证明）'};
export const candidateColumns=['lead_id','company_candidate','country_candidate','country_code','region_candidate','city_candidate','category_candidate','website_candidate','source_url','source_kind','review_status','current_status','source_snapshot_date'];
export function publicCandidateUrl(value,optional=false){
 if(!value&&optional)return true;
 const text=String(value||'');
 if(!/^https:\/\/[a-z0-9][a-z0-9.-]*\.(?:[a-z]{2,}|xn--[a-z0-9-]{2,})(\/[^\s<>]*)?$/i.test(text)||/[?#@]/.test(text)||/google\s*maps|maps\.google|google\.[^/]+\/maps|g\.page/i.test(text))return false;
 try{return !['gmail.com','mail.ru','web3forms.com','outlook.com','yahoo.com','hotmail.com'].includes(new URL(text).hostname.replace(/^www\./,''))}catch{return false}
}
export function candidateImportRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>2000)throw Error('每个文件需有1—2000条候选；每批200条分段保存。');
 const issues=[];
 const parsed=rows.map((row,index)=>{
  const line=Number.isInteger(row.__rowNum__)?row.__rowNum__+1:index+2;
  const unknown=Object.keys(row).filter(key=>!candidateColumns.includes(key));
  if(unknown.length)issues.push(`第${line}行：存在非公司级字段，请移除联系人、邮箱、电话或私人备注列`);
  const item=Object.fromEntries(candidateColumns.map(key=>[key,String(row[key]??'').trim()]));
  if(item.company_candidate.length<2||item.country_candidate.length<2||item.lead_id.length<8||!item.source_snapshot_date)issues.push(`第${line}行：缺公司、国家、候选编号或来源快照日期`);
  if(Object.entries({company_candidate:300,country_candidate:100,lead_id:80,country_code:20,region_candidate:100,city_candidate:150,category_candidate:300,source_url:2000,website_candidate:1000,source_snapshot_date:40}).some(([key,max])=>item[key].length>max))issues.push(`第${line}行：公司级字段超长，请检查是否混入其他信息`);
  if(!publicCandidateUrl(item.source_url)||!publicCandidateUrl(item.website_candidate,true))issues.push(`第${line}行：需有效公开HTTPS来源；地图、邮箱平台、查询参数链接不作为公司证据`);
  if(!Object.hasOwn(candidateSourceLabels,item.source_kind))issues.push(`第${line}行：来源类型不正确`);
  if(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/i.test([item.company_candidate,item.country_candidate,item.category_candidate,item.city_candidate,item.region_candidate].join(' ')))issues.push(`第${line}行：公司字段混有邮箱`);
  // File status is never trusted as a verification decision.
  item.review_status='needs_official_source_review';item.current_status='待核实';
  return item;
 });
 if(issues.length)throw Error(issues.slice(0,30).join('\n')+(issues.length>30?`\n另有${issues.length-30}项，请分批修正。`:''));
 return parsed;
}
export function candidateBatches(rows){const chunks=[];for(let i=0;i<rows.length;i+=200)chunks.push({id:crypto.randomUUID(),rows:rows.slice(i,i+200)});return chunks}
export function candidateReceipt(value,id,count){
 if(value?.batch_id!==id||value.processed!==count||!Number.isInteger(value.added)||!Number.isInteger(value.deduplicated)||value.added+value.deduplicated!==count||!value.recorded_at)throw Error('服务器回执未核对成功，尚未确认本批结果；保留文件，可用同批次重试。');
 return value;
}
