// Deterministic preliminary selection: catalogue statements are not certified compliance.
export const selectionIntent=q=>/选型|推荐.*(门|锁|产品|型号)|帮我选/.test(String(q));
const CATS=[[/智能锁/,['smart_lock']],[/木门/,['wooden_door']],[/防盗门/,['security_door']],[/医院门|医疗门/,['hospital_door']],[/防火窗/,['fire_window']]];
export function selectionRequirements(question){
 const q=String(question),category=CATS.find(([re])=>re.test(q))?.[1]||null;
 // Only literal catalogue matching is automated; fire/structural certification requires review.
 const constraints=[];
 for(const [id,re,key] of [
  ['门扇厚度',/门扇厚度\s*(至少|不低于|不小于|最多|不大于|不超过|为|等于)?\s*(\d+(?:\.\d+)?)\s*(mm|毫米)/i,/^(门扇厚度|door leaf thickness|leaf thickness)$/i],
  ['开锁方式',/(指纹|人脸|密码|掌静脉)开锁/,/开锁|unlock|standard features/i]
 ]){const m=q.match(re);if(m)constraints.push(id==='开锁方式'?{id,value:m[1],key,type:'literal'}:{id,value:Number(m[2]),op:/至少|不低于|不小于/.test(m[1])?'min':/最多|不大于|不超过/.test(m[1])?'max':'eq',key,type:'number'})}
 return {category,constraints,question:q};
}
export function selectProducts(catalog,req){
 if(!req.category||!req.constraints.length)return {status:'needs_requirements',rows:[]};
 const groups=new Map();for(const p of catalog?.products||[]){if(!req.category.includes(p.category)||!p.model)continue;if(!groups.has(p.model))groups.set(p.model,[]);groups.get(p.model).push(p)}
 const rows=[...groups].map(([model,products])=>{
  const checks=req.constraints.map(c=>{
   const evidence=products.flatMap(p=>Number.isInteger(p.page)&&p.page>0&&p.catalog?Object.entries(p.specs||{}).filter(([k,v])=>c.key.test(k)&&typeof v==='string').map(([field,value])=>({field,value,page:p.page,catalog:p.catalog})):[]);
   let verdict='unknown';
   if(c.type==='number'){
    const values=evidence.map(e=>e.value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:mm|毫米)$/i));
    if(values.length&&values.every(Boolean)){const nums=values.map(m=>Number(m[1]));if(new Set(nums).size===1)verdict=(c.op==='min'?nums[0]>=c.value:c.op==='max'?nums[0]<=c.value:nums[0]===c.value)?'match':'conflict'}
   }else if(evidence.length&&evidence.every(e=>e.value.includes(c.value)&&! /不|无|未|not|without|optional|选配/i.test(e.value)))verdict='match';
   return {dimension:c.id,verdict,evidence};
  });
  return {model,checks,status:checks.some(c=>c.verdict==='conflict')?'conflict':checks.every(c=>c.verdict==='match')?'candidate':'unknown'};
 });
 return {status:'preliminary',rows};
}
export function selectionAnswer(catalog,question){
 const req=selectionRequirements(question),r=selectProducts(catalog,req);
 if(r.status==='needs_requirements')return '为了按资料做选型，请说明产品门类和具体要求。当前支持智能锁、木门、防盗门、医院门、防火窗的初筛，例如“木门选型，门扇厚度至少45毫米”。也请补充使用国家、场景、尺寸、预算和认证要求；未支持的条件不会被自动判为满足。';
 const groups=[['candidate','已匹配上述可计算条件的候选'],['conflict','已发现条件不符'],['unknown','依据不足或表述不一致']];
 return '产品选型初筛（不是最终推荐或合规结论）\n仅检查：'+req.constraints.map(c=>c.id+' '+(c.type==='number'?{min:'至少',max:'最多',eq:'等于'}[c.op]:'')+c.value+(c.type==='number'?'mm':'')).join('、')+'。其他要求尚未判定。\n'+groups.map(([state,label])=>{const rows=r.rows.filter(x=>x.status===state);return label+'：'+rows.length+'个\n'+rows.slice(0,5).map(x=>x.model+'：'+x.checks.map(c=>c.dimension+' '+({match:'画册数值/文字匹配',conflict:'不匹配',unknown:'待核对'}[c.verdict])+c.evidence.map(e=>`（${e.value}，${e.catalog}第${e.page}页）`).join('')).join('；')).join('\n')}).join('\n\n')+'\n下一步：核对候选的现行版本、完整配置、安装尺寸、使用环境、检测报告和预算。画册未经专家审核，不能据此承诺性能；同类标准不得直接换算。内部资料未发送外部模型。';
}
