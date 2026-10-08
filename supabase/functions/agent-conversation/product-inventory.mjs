import {expertProfile,expertProfileText} from './product-expert-profile.mjs';
// Entire supplied catalogue, not merely products returned by a semantic search.
// Exact model spelling only: possible aliases are never silently merged.
export const inventoryIntent=q=>/产品(知识|专家)?(档案|缺口|覆盖清单)|全型号(清单|资料|覆盖)/.test(String(q));
export function productInventory(catalog){
 const map=new Map();
 for(const row of catalog?.products||[]){
  if(typeof row.model!=='string'||!row.model.trim())continue;
  const model=row.model.trim();if(!map.has(model))map.set(model,[]);map.get(model).push(row);
 }
 return [...map].map(([model,rows])=>{
  const findings=rows.flatMap(r=>Object.entries(r.specs||{}).filter(([k,v])=>typeof v==='string'&&v.trim()&&Number.isInteger(r.page)&&r.page>0&&r.catalog).map(([field,value])=>({field,value,page:r.page,asset:String(r.catalog),version:null,current:null})));
  const conflicts=[];for(const field of new Set(findings.map(f=>f.field))){if(new Set(findings.filter(f=>f.field===field).map(f=>f.value)).size>1)conflicts.push(field)}
  return {model,source_count:rows.length,profile:expertProfile({findings,conflicts,partial:rows.some(r=>r.unreadable?.length)}),conflicts};
 });
}
export function inventoryAnswer(catalog,question){
 const all=productInventory(catalog),page=Math.max(1,Math.min(1000,Number(String(question).match(/第\s*(\d+)\s*页/)?.[1])||1)),size=5,rows=all.slice((page-1)*size,page*size);
 return `产品档案清单：当前已收录画册共 ${all.length} 个独立型号名称，其中 ${all.filter(p=>!p.profile.dimensions.some(d=>d.evidence.length)).length} 个没有可归类参数依据。\n仅代表已收录画册，不等于公司全部现售产品；未校验画册版本有效性，不自动合并别名。\n第${page}页，共${Math.max(1,Math.ceil(all.length/size))}页。\n\n`+rows.map(p=>p.model+expertProfileText(p.profile)).join('\n\n')+(rows.length?'':'本页没有条目。')+`\n可说“产品档案第${page+1}页”继续查看。资料库关联状态尚需逐型号查询，不能把画册缺项视为全库缺失。`;
}
