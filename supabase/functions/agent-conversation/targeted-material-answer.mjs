import {productParameterAnswer} from './product-parameter-answer.mjs';
import {trainingAnswer} from './training-answer.mjs';
// Answer and attachments share the same gated evidence selection. Never attach
// every search hit merely because it matched a broad keyword.
export function targetedMaterialAnswer(data,question,native=null){
 const answer=productParameterAnswer(data,question,native)||trainingAnswer(data,question);
 if(!answer)return null;
 const materials=(data.assets||[]).filter(asset=>{
  const single={...data,assets:[asset]};
  return !!(productParameterAnswer(single,question)||trainingAnswer(single,question));
 });
 return {answer,materials};
}
