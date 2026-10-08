import {gateMaterialEvidence} from './evidence-gate.mjs';
import {productLedger,productLedgerText} from './product-coverage.mjs';
// A file mention is a navigation hint, never proof all facts in the file belong to this model.
const exact=s=>String(s||'').normalize('NFKC').trim().toUpperCase();
export function modelMaterialEvidence(models,results){
 const wanted=new Set(models.map(exact));const assets=[],seen=new Set();let available=0;
 for(const result of results){
  if(result?.status!=='available')continue;available++;
  const gated=gateMaterialEvidence(result);
  for(const a of gated.assets){
   const d=a.document,u=d?.product_understanding;
   if(!u)continue;
   // Ambiguous aliases need explicit review; matching on f.model alone could merge variants.
   const findings=u.findings.filter(f=>{if(!wanted.has(exact(f.product)))return false;const key=JSON.stringify([a.id,f.product,f.page,f.field,f.value,f.quote]);if(seen.has(key))return false;seen.add(key);return true});
   if(findings.length)assets.push({...a,document:{...d,product_understanding:{...u,findings}}});
  }
 }
 if(!available)return '\n型号证据档案：本次物料读取失败，不能判断资料覆盖。';
 if(!assets.length)return '\n型号证据档案：本次返回页中没有通过原文校验且明确归属该型号的提取结果。相关文件仅作为查阅入口，不视为产品参数依据。';
 return '\n'+productLedgerText(productLedger({status:'available',assets}));
}
