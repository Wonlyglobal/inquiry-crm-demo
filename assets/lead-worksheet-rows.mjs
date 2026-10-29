// Count values, not Excel's formatted used range. Preserve physical row numbers.
export function compactLeadWorksheet(sheet){
 const rows=new Map();let lastColumn='A',lastIndex=0;
 for(const [address,cell] of Object.entries(sheet||{})){
  const match=/^([A-Z]+)([1-9][0-9]*)$/.exec(address);
  if(!match||cell?.v===undefined||cell.v===null||String(cell.v).trim()==='')continue;
  const row=Number(match[2]);
  if(!rows.has(row))rows.set(row,[]);
  rows.get(row).push([match[1],cell]);
  const index=[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
  if(index>lastIndex){lastIndex=index;lastColumn=match[1]}
  if(rows.size>201)throw Error('每批最多200条实际数据，请拆分文件（空白及仅格式行不计数）');
 }
 const sourceRows=[...rows.keys()].sort((a,b)=>a-b),compact={};
 sourceRows.forEach((source,index)=>{for(const [col,cell] of rows.get(source))compact[col+(index+1)]=cell});
 compact['!ref']=`A1:${lastColumn}${Math.max(1,sourceRows.length)}`;
 return {sheet:compact,sourceRows};
}
export function leadWorksheetRecords(X,worksheet){
 const {sheet,sourceRows}=compactLeadWorksheet(worksheet);
 const records=X.utils.sheet_to_json(sheet,{defval:'',raw:false});
 return records.map((record,index)=>Object.defineProperty({...record},'__rowNum__',{value:sourceRows[index+1]-1}));
}
