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

// The workbook retains original cell addresses in each source piece. Keep the
// field label, model, and value from the same piece so a truncated projection
// cannot lend a model to a different column or repeat a header from another page.
export function sheetColumnDimensions(page,model){
 if(page.kind!=='sheet_cells')return [];
 const results=[];
 for(const piece of page.chunks||[]){
  const rows=new Map();
  const cells=[...piece.matchAll(/(?:^|\n| \| )([A-Z]{1,3})([1-9][0-9]*)=/g)];
  for(const [index,cell] of cells.entries()){
   const [,column,rawRow]=cell;
   const start=cell.index+cell[0].length,end=cells[index+1]?.index??piece.length;
   const row=Number(rawRow),value=piece.slice(start,end).trim();
   const group=rows.get(row)||new Map();
   if(group.has(column)){rows.clear();break}
   group.set(column,{address:column+rawRow,value});
   rows.set(row,group);
  }
  if(rows.size===0)continue;
  let anchor=null;
  for(const [row,group] of rows){
   const label=group.get('A')?.value.normalize('NFKC').trim()||'';
   if(/^(?:产品型号|型号|model(?: no\.?)?)(?:\s*[（(][^）)]+[）)])?$/i.test(label)){
    const modelCells=[...group].filter(([column,cell])=>column!=='A'&&materialModelCodes(cell.value).some(code=>id(code)===id(cell.value)));
    const matches=modelCells.filter(([,cell])=>id(cell.value)===id(model));
    anchor=modelCells.length>=2&&matches.length===1?{row,column:matches[0][0],cell:matches[0][1]}:null;
    continue;
   }
   if(!anchor||row<=anchor.row||row-anchor.row>12)continue;
   if(!/尺寸|\bdimensions?\b|\bpanel size\b/i.test(label)||/门厚|door thickness|\d|包装|package/i.test(label))continue;
   const cell=group.get(anchor.column);
   if(!cell||cell.value.length>200||!/[\d.]\d*\s*[×xX*]\s*\d+(?:\.\d+)?[^\n]{0,30}(?:mm\b|毫米)/i.test(cell.value))continue;
   results.push({value:cell.value,modelCell:anchor.cell.address,valueCell:cell.address,fieldCell:'A'+row});
  }
 }
 return results;
}


export function validatedSheetFinding(page,finding){
 if(finding.method!=='sheet_columns'||page.kind!=='sheet_cells'||!page.chunks.some(piece=>piece.includes(finding.quote)))return null;
 const cells=sheetColumnDimensions({...page,chunks:[finding.quote]},finding.model||finding.product);
 return cells.find(cell=>cell.value===finding.value&&cell.modelCell===finding.modelCell&&
  cell.valueCell===finding.valueCell&&cell.fieldCell===finding.fieldCell)||null;
}
