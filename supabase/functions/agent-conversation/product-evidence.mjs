// Company-only results: never include this structure in external model context.
export function productEvidence(raw,sha,{rank=()=>0,onCandidates=()=>{}}={}){
 if(raw?.schema!=='local-product-v1'||!/^[a-f0-9]{64}$/.test(sha||'')||raw.source_sha256!==sha)return null;
 const statuses=['processing','processed','partial','limited','no_text'];
 const input=Array.isArray(raw.findings)?raw.findings:[];
 const valid=input.filter(f=>Number.isInteger(f?.page)&&f.page>0&&f.page<=500&&typeof f.product==='string'&&f.product.length>=2&&f.product.length<=100&&typeof f.quote==='string'&&f.quote.length<=500&&f.quote.includes(f.product)&&typeof f.field==='string'&&f.field.length<=60&&typeof f.value==='string'&&f.value.length<=250).map(f=>({product:f.product,field:f.field,value:f.value,page:f.page,quote:f.quote,human_verified:false,...(typeof f.model==='string'&&f.model.length<=60?{model:f.model}:{}),...(f.method==='rule'?{method:'rule'}:{})}));
 // Select supported, requested evidence before the existing display limit. Never infer an alias.
 const seen=new Set(),unique=valid.filter(f=>{const key=JSON.stringify([f.product,f.model||'',f.page,f.field,f.value,f.quote]);if(seen.has(key))return false;seen.add(key);return true});
 onCandidates(unique);
 const findings=unique.map(f=>({finding:f,rank:rank(f)})).sort((a,b)=>b.rank-a.rank).slice(0,12).map(f=>f.finding);
 return {status:statuses.includes(raw.status)?raw.status:'partial',findings,human_verified:false,selection:{invalid_findings:input.length-valid.length,duplicate_findings:valid.length-unique.length,omitted_findings:Math.max(0,unique.length-findings.length)}};
}
export function productEvidenceText(data){
 if(!data||!data.findings.length)return '';
 const status={processing:'内部语义整理中',processed:'内部语义提取已处理，未人工核验',partial:'内部语义提取存在缺口',limited:'内部语义结果达到上限',no_text:'没有可处理文字'}[data.status];
 return '\n'+status+'。不是完整产品理解或认证结论。\n'+data.findings.map(f=>`${f.product}${typeof f.model==='string'&&f.model&&f.model!==f.product?`（画册型号 ${f.model.slice(0,60)}）`:''}｜第${f.page}页｜${f.field}${f.method==='rule'?'（规则摘录）':''}\n机器解释（待核对）：${f.value}\n原文依据：${f.quote}`).join('\n');
}
