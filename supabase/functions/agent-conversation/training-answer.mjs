import {documentTopicTerms} from './document-topic.mjs';
import {materialModelCodes,materialVersion} from './product-input.mjs';
// Keep source wording and section scope: a numbered condition must not be
// detached from its product heading or from the following exception.
export function trainingPassages(chunks,question){
 const terms=documentTopicTerms(question),care=/保养|维护|清洁|清洗|打理|maintenance|cleaning/i.test(question);
 const passages=[];
 for(const chunk of chunks){
  if(!terms.some(term=>chunk.includes(term)))continue;
  if(care&&/日常使用|维护和保养|产品保养/.test(chunk)){
   passages.push(chunk.trim());continue;
  }
  const lines=chunk.split('\n');let heading='';
  for(let i=0;i<lines.length;i++){
   const line=lines[i].trim();
   if(!line)continue;
   if(/(?:配置说明|检验标准|验收标准|安装说明)[：:]?$/.test(line))heading=line;
   if(!terms.some(term=>line.includes(term)))continue;
   if(line===heading)continue;
   const item=[line];
   // Continuation lines belong to the item until a new item/section begins.
   while(i+1<lines.length&&lines[i+1].trim()&&!/^\s*(?:\d+[.、]|[一二三四五六七八九十]+[、．.]|.*[：:]\s*$)/.test(lines[i+1]))item.push(lines[++i].trim());
   passages.push((heading?heading+'\n':'')+item.join('\n'));
  }
 }
 return [...new Set(passages.filter(Boolean))];
}
export function trainingAnswer(data,question){
 if(data.evidence_gate?.version!==1||materialModelCodes(question).length||!/木门/.test(question))return null;
 if(!documentTopicTerms(question).length)return null;
 const version=materialVersion(question),blocks=[];
 for(const asset of data.assets||[]){
  if(!/木门/.test(asset.name||'')||!version&&asset.isCurrentVersion!==true)continue;
  if(version&&materialVersion(asset.versionLabel)!==version)continue;
  for(const page of asset.document?.pages||[]){
   const passages=trainingPassages(page.chunks||[],question);
   if(!passages.length)continue;
   blocks.push(`${passages.join('\n')}\n来源：${asset.name}，第 ${page.page} 页${asset.versionLabel?'，'+asset.versionLabel:''}`);
  }
 }
 if(!blocks.length)return null;
 return `资料中的相关说明如下：\n\n${blocks.join('\n\n')}\n\n以上为本次找到的原页摘录。需要我打开对应资料给你核对吗？`;
}
