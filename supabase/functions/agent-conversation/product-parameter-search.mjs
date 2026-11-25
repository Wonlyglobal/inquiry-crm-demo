import {materialFields} from './product-input.mjs';
import {materialConstraints} from './material-relevance.mjs';
import {gateMaterialEvidence} from './evidence-gate.mjs';
import {sourceTaskMaterials} from './source-task.mjs';

// The live adapter selects pages by OR terms before a six-page cap.
// Use only a complete model spelling there, never common field words that
// can evict the model page. Fields still guide local evidence selection.
export function parameterSearchPlan(turn){
 const wanted=materialFields(turn.question).filter(f=>['供电','电池','材质','质保','尺寸','厚度'].includes(f));
 if(!wanted.length)return null;
 const constraints=materialConstraints(turn.question);
 const spellings=[...new Set([turn.model,turn.model.replace(/[\s_/.\-]+/g,'')])];
 return {constraints,overflow:false,requests:spellings.map(model=>({query:model,terms:[model],page:1,constraints}))};
}
export async function loadParameterMaterials(turn,load){
 const plan=parameterSearchPlan(turn);if(!plan)return null;
 const groups=await Promise.all(plan.requests.map(async request=>{
  const pages=[];
  for(let page=1;page<=5;page++){
   const r=gateMaterialEvidence(await load({...request,page}));pages.push(r);
   if(r.status!=='available'||!r.has_more)break;
  }
  return pages;
 }));
 const responses=groups.flat();
 const data=sourceTaskMaterials(responses,plan.constraints);
 const failed=responses.some(r=>r.status!=='available');
 const more=groups.some(p=>p.at(-1)?.has_more===true);
 return {...data,status:responses.every(r=>r.status!=='available')?responses[0].status:'available',has_more:more,
  parameter_search:{queries:responses.length,incomplete:failed||more}};
}
