// Precision gate for explicit multi-constraint requests. Missing metadata is not a match.
export function materialConstraints(question){
 const q=String(question);
 return {fireDoor:/防火门|fire[- ]?rated door|fire door/i.test(q),english:/英文|英语|english/i.test(q),manual:/产品手册|产品目录|宣传册|product (?:manual|catalog)|brochure/i.test(q)};
}
export function relevantMaterial(asset,constraints){
 const identity=[asset.name,asset.relativePath,...(asset.document?.pages||[]).flatMap(p=>p.chunks||[])].join(' ');
 const language=String(asset.language||''),profile=asset.document?.knowledge_profile;
 if(constraints.fireDoor&&!profile?.categories?.some(x=>x.value==='fire_door')&&!/防火门|fire[- ]?(?:rated )?doors?/i.test(identity))return false;
 if(constraints.english&&!profile?.languages?.includes('en')&&!/^(?:en|en[-_][a-z]+|english|英文|英语)$/i.test(language.trim())&&!/英文|英语|english|(?:^|[\s_\-.\/])EN(?:[\s_\-.\/]|$)/i.test([asset.name,asset.relativePath].join(' ')))return false;
 if(constraints.manual&&!profile?.document_types?.some(x=>x.value==='product_manual')&&!/手册|目录|宣传册|样册|图册|catalog(?:ue)?|brochure|product manual/i.test([asset.name,asset.relativePath].join(' ')))return false;
 return true;
}
export function filterMaterialResults(data,question){
 if(data.status!=='available')return data;
 const constraints=materialConstraints(question);if(!Object.values(constraints).some(Boolean))return data;
 const assets=data.assets.filter(a=>relevantMaterial(a,constraints));
 return {...data,assets,relevance_filtered:true,candidate_count:data.assets.length,match_total:null};
}
