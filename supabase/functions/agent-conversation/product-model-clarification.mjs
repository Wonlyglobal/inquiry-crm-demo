import {bareModel,materialFields,materialModelCodes,normalizeProductInput} from './product-input.mjs';

const pending='产品型号待确认：';
const fields=q=>materialFields(q).filter(f=>!['型号','来源','版本','页码'].includes(f));
// A numeric variant is an incomplete identifier, never an alias for a known SKU.
export function productModelClarification(question){
 const q=normalizeProductInput(question).trim(),wanted=fields(q);
 if(!wanted.length||materialModelCodes(q).length||q.length>180)return null;
 if(!/^(?:请问|请查|我问的是|那)?\s*\d{2,4}\s*(?:max|pro|plus|ultra|lite)\b/i.test(q))return null;
 return {answer:'请确认完整型号（含字母和后缀），我会继续核对'+wanted.join('、')+'。',material_question:pending+wanted.join('、')};
}

export function correctedProductQuestion(question,history=[]){
 const q=normalizeProductInput(question).trim();
 const code=q.replace(/^(?:是|型号是|改为|换成|我说的是|不是[\s\S]{1,40}[，,]是)\s*/,'');
 if(!bareModel(code))return null;
 const latest=String(history.at(-1)||'');
 if(!/^(?:产品型号待确认：|私有产品：|资料任务：)/.test(latest))return null;
 const wanted=fields(latest);if(!wanted.length)return null;
 // Carry only requested field labels. Never carry the old model's suffix or edition.
 return materialModelCodes(code)[0]+'；'+wanted.join('、');
}
