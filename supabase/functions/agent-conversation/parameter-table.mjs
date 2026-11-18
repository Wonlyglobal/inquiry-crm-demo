import {materialModelCodes} from './product-input.mjs';
const id=s=>String(s).normalize('NFKC').toUpperCase().replace(/[\s_/.-]+/g,'');
// Only a native, single-model table with an explicit model header can lend
// identity to a following row. The evidence remains one literal substring.
export function tableRowEvidence(page,fact,model){
 if(!['native_text','native_and_ocr'].includes(page.kind)||!fact.quote||!model)return null;
 for(const raw of page.chunks||[]){
  const text=String(raw).split('[页面OCR')[0];
  const at=text.indexOf(fact.quote);if(at<0)continue;
  const models=[...new Set(materialModelCodes(text).map(id))];
  if(models.length!==1||models[0]!==id(model))continue;
  const header=/(?:产品型号|Product\s+model)\s*[:：]?/ig;let match;
  while((match=header.exec(text))){
   const end=at+fact.quote.length,quote=text.slice(match.index,end);
   if(at<match.index||quote.length>500||quote.length<=fact.quote.length)continue;
   const head=text.slice(match.index,Math.min(at,match.index+140));
   if(!materialModelCodes(head).some(m=>id(m)===id(model)))continue;
   // Multiple numeric entries in a row can represent a multi-product table.
   if(/\t[^\n]*\t/.test(fact.quote))continue;
   return {field:fact.field,quote};
  }
 }
 return null;
}
export function dimensionRows(quote){
 return String(quote).split(/\r?\n/).filter(line=>/(?:尺寸|dimensions?|panel\s+size)/i.test(line)&&!/门厚|door\s*thickness/i.test(line)&&/\d/.test(line)).map(line=>line.trim());
}
export function dimensionPart(value){
 if(/前面板|front\s*panel/i.test(value))return '前面板';
 if(/后面板|rear\s*panel|back\s*panel/i.test(value))return '后面板';
 return '尺寸';
}
