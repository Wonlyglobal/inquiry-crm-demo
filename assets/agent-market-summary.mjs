// Display-only validation: never deletes inquiries or changes their other metrics.
export function marketSummary(inquiries){
 const counts=new Map();let placeholders=0,missing=0;
 for(const row of inquiries||[]){
  const name=String(row.target_country||'').normalize('NFKC').trim();
  if(!name){missing++;continue}
  if(/^(?:test[ _-]*(?:region|country|market)(?:[ _-]*\d+)?|测试(?:地区|国家|市场)(?:\s*\d+)?)$/i.test(name)){placeholders++;continue}
  counts.set(name,(counts.get(name)||0)+1);
 }
 const top=[...counts].sort((a,b)=>b[1]-a[1])[0];
 return {value:top?`${top[0]} ${top[1]}`:'暂无可用市场数据',note:placeholders?`${placeholders}条测试地区值未参与市场排名，待核对${missing?`；${missing}条未填写地区`:''}`:missing?`${missing}条未填写地区，未参与市场排名`:null};
}
