// Company-only results: never include this structure in external model context.
export function productEvidence(raw,sha){
 if(raw?.schema!=='local-product-v1'||!/^[a-f0-9]{64}$/.test(sha||'')||raw.source_sha256!==sha)return null;
 const statuses=['processing','processed','partial','limited','no_text'];
 const findings=(Array.isArray(raw.findings)?raw.findings:[]).slice(0,12).filter(f=>Number.isInteger(f.page)&&f.page>0&&f.page<=500&&typeof f.product==='string'&&f.product.length>=2&&f.product.length<=100&&typeof f.quote==='string'&&f.quote.length<=500&&f.quote.includes(f.product)&&typeof f.field==='string'&&f.field.length<=60&&typeof f.value==='string'&&f.value.length<=250).map(f=>({product:f.product,field:f.field,value:f.value,page:f.page,quote:f.quote,human_verified:false}));
 return {status:statuses.includes(raw.status)?raw.status:'partial',findings,human_verified:false};
}
export function productEvidenceText(data){
 if(!data)return '';
 const status={processing:'内部语义整理中',processed:'内部语义提取已处理，未人工核验',partial:'内部语义提取存在缺口',limited:'内部语义结果达到上限',no_text:'没有可处理文字'}[data.status];
 return '\n'+status+'。不是完整产品理解或认证结论。\n'+data.findings.map(f=>`${f.product}｜第${f.page}页｜${f.field}\n机器解释（待核对）：${f.value}\n原文依据：${f.quote}`).join('\n');
}
